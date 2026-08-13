/**
 * 节点生命周期状态机（lifecycle.ts）——构建/清理显式状态管理
 *
 * 根治：「dispose 掏空旧树但 build 剪枝按引用误判可用」→ 剪枝复用空壳 →
 * diff 遇未构建组件 → renderComp 抛「not built」（demo 搜索序列实测）
 *
 * 状态：fresh → building → built / pruned；任何状态 → disposed（diff 移除）
 * 关键：dispose 显式标记 _lifecycle=disposed——build 剪枝检查跳过被清理的旧树。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'
import { transition, type Lifecycle, type LifecycleEvent } from '../ui-dom/vdom2/lifecycle.ts'

function setup() {
  const dom = new JSDOM('<div id="root"></div>')
  const d = dom.window.document
  const browser: any = {
    createElement: (t: string) => d.createElement(t),
    createElementNS: (ns: string, t: string) => d.createElementNS(ns, t),
    createTextNode: (s: string) => d.createTextNode(s),
    createComment: (s: string) => d.createComment(s),
    createDocumentFragment: () => d.createDocumentFragment(),
    bodyElement: () => d.body,
  }
  const registry = createRegistry()
  const ui = { _rootVNodeId: null, render: async () => {}, setMounting: () => {}, endMounting: () => {} }
  const ctx: any = { browser, __registry: registry, ui }
  const root = d.getElementById('root')!
  return { ctx, root }
}

// ── L1: 状态转换表 ──

test('L1: 生命周期转换矩阵（合法转换）', () => {
  const cases: Array<[Lifecycle, LifecycleEvent, Lifecycle]> = [
    ['fresh', 'BUILD_START', 'building'],
    ['fresh', 'PRUNE', 'pruned'],
    ['fresh', 'DISPOSE', 'disposed'],
    ['building', 'BUILD_DONE', 'built'],
    ['building', 'DISPOSE', 'disposed'],
    ['built', 'BUILD_START', 'building'],
    ['built', 'PRUNE', 'pruned'],
    ['built', 'DISPOSE', 'disposed'],
    ['pruned', 'BUILD_START', 'building'],
    ['pruned', 'PRUNE', 'pruned'],
    ['pruned', 'DISPOSE', 'disposed'],
    ['disposed', 'BUILD_START', 'building'],
  ]
  for (const [from, event, to] of cases) {
    assert.equal(transition(from, event), to, `${from} --${event}--> ${to}`)
  }
})

test('L1b: 非法转换保留原状态（不抛错不静默吞）', () => {
  // fresh → BUILD_DONE 合法（native/Fragment 同步构建路径——无 building 中间态）
  assert.equal(transition('fresh', 'BUILD_DONE'), 'built', 'native 同步构建 fresh → built')
  assert.equal(transition('disposed', 'PRUNE'), 'disposed', 'disposed 不能剪枝（必须重建）')
  assert.equal(transition('disposed', 'BUILD_DONE'), 'disposed', 'disposed 不能直接完成（必须先 BUILD_START）')
  assert.equal(transition('building', 'BUILD_START'), 'building', 'building 中不能再 BUILD_START')
})

// ── L2: build 生命周期流转 ──

test('L2: build 完整路径 fresh → building → built', async () => {
  const { ctx } = setup()
  const C = (_init: any, _c: any) => (_p: any) => h('span', {}, 'x')
  const tree = h('div', {}, [h(C, {})])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const comp = (tree as any)._child[0]
  assert.equal(comp._lifecycle, 'built', '完整构建后 lifecycle=built')
  assert.ok(comp._render, '_render 已设')
})

test('L2b: 同位置同类型剪枝 → pruned', async () => {
  const { ctx } = setup()
  const C = (_init: any, _c: any) => (_p: any) => h('span', {}, 'x')
  const v1 = h('div', {}, [h(C, { a: 1 })])
  await buildVNode(v1, ctx, null, ctx.__registry)
  const comp1 = (v1 as any)._child[0]
  assert.equal(comp1._lifecycle, 'built')
  // 同 props 重构建 → 剪枝
  const v2 = h('div', {}, [h(C, { a: 1 })])
  await buildVNode(v2, ctx, v1, ctx.__registry)
  const comp2 = (v2 as any)._child[0]
  assert.equal(comp2._lifecycle, 'pruned', '同 props 剪枝 → pruned')
  assert.equal(comp2._child, comp1._child, '剪枝复用旧 _child')
})

// ── L3: dispose 显式标记 + 递归 ──

test('L3: dispose 标记整树 disposed（递归）', async () => {
  const { ctx } = setup()
  const Inner = (_i: any, _c: any) => (_p: any) => h('span', {}, 'inner')
  const Outer = (_i: any, _c: any) => (_p: any) => h('div', {}, [h(Inner, {})])
  const tree = h('div', {}, [h(Outer, {})])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const outer = (tree as any)._child[0]
  const inner = (outer._child as any)._child[0]
  assert.equal(outer._lifecycle, 'built')
  assert.equal(inner._lifecycle, 'built')

  // 从树中移除（diff 删除）→ dispose 递归标记
  const { callRefCleanupFor } = await import('../ui-dom/vdom2/registry.ts')
  callRefCleanupFor(outer, ctx.__registry)
  assert.equal(outer._lifecycle, 'disposed', '外层组件 disposed')
  assert.equal(inner._lifecycle, 'disposed', '递归清理内层组件 disposed')
  assert.equal(outer._render, null, 'dispose 清 _render')
})

// ── L4: 核心回归——disposed 旧树不被剪枝复用（demo 搜索序列） ──

test('L4: 搜索序列——组件 null→恢复后剪枝跳过 disposed oldV（重建不抛错）', async () => {
  const { ctx, root } = setup()
  // 模拟 Section：props 稳定（title），内部内容随 hidden 切换
  const Section = (initProps: any, _c: any) => {
    return (props: any) => (props.hidden ? null : h('div', { class: 'sec' }, [h('span', {}, 'A'), h('span', {}, 'B')]))
  }
  const mk = (hidden: boolean) => h('div', {}, [h(Section, { title: 'T', hidden })])

  // 轮次 1：有内容（build → built）
  let tree = mk(false)
  await buildVNode(tree, ctx, null, ctx.__registry)
  const node = renderValue(tree, ctx, ctx.browser)
  if (node) root.appendChild(node)
  const sec1 = (tree as any)._child[0]
  assert.equal(sec1._lifecycle, 'built')

  // 轮次 2：搜索隐藏（Section 输出 null）→ compToComp null 分支：dispose 输出 + 清引用
  let tree2 = mk(true)
  await buildVNode(tree2, ctx, tree, ctx.__registry)
  patchValue(root, root.firstChild, tree, tree2, { browser: ctx.browser, registry: ctx.__registry })
  assert.equal(sec1._lifecycle, 'built', 'Section 实例保留（输出 null 不销毁实例——_render 未清）')
  assert.equal(sec1._child, null, '输出引用已清（防 build 剪枝按引用误判复用空壳）')
  // 旧输出内部组件被递归 dispose（标记 disposed）
  const oldInner = (sec1._outputChild as any)?.type === 'div' ? sec1._outputChild : null
  assert.ok(oldInner == null || oldInner._lifecycle === 'disposed', '旧输出已 dispose')

  // 轮次 3：同 props（hidden 仍 true）→ oldV._child 为 null → 不剪枝 → 重建
  let tree3 = mk(true)
  await buildVNode(tree3, ctx, tree2, ctx.__registry)
  const sec3 = (tree3 as any)._child[0]
  assert.equal(sec3._lifecycle, 'built', '同 props + 旧 _child 已清 → 剪枝条件不满足 → 重建')

  // 轮次 4：恢复有内容 → diff 不抛错
  let tree4 = mk(false)
  await buildVNode(tree4, ctx, tree3, ctx.__registry)
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    patchValue(root, root.firstChild, tree3, tree4, { browser: ctx.browser, registry: ctx.__registry })
  } finally {
    console.error = orig
  }
  assert.deepEqual(errs.filter((e) => e.includes('render error')), [], '多轮 null 切换不得渲染错误')
  assert.equal(root.querySelector('.sec')!.textContent, 'AB', '恢复渲染正确')
})

// ── L5: 原生项 dispose 也标记（一致性） ──

test('L5: native 子项 dispose 标记 disposed（整树递归一致性）', async () => {
  const { ctx } = setup()
  const C = (_i: any, _c: any) => (_p: any) => h('div', { class: 'box' }, [h('span', {}, 'x')])
  const tree = h('div', {}, [h(C, {})])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const comp = (tree as any)._child[0]
  const box = comp._child
  const { callRefCleanupFor } = await import('../ui-dom/vdom2/registry.ts')
  callRefCleanupFor(comp, ctx.__registry)
  assert.equal(box._lifecycle, 'disposed', 'native 输出也标记 disposed（子树一致性）')
  assert.equal(box._child, null, 'native _child 清空')
})

// ── L6: native/Fragment 构建状态（四状态机·节点层——所有 vnode 统一生命周期） ──

test('L6: native/Fragment build 后 built（fresh → built 同步路径）', async () => {
  const { ctx } = setup()
  const tree = h('div', { class: 'w' }, [h('span', {}, 'a'), h(Fragment, {}, [h('i', {}, 'x'), h('i', {}, 'y')])])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const div = tree as any
  assert.equal(div._lifecycle, 'built', 'native div 构建后 built')
  const span = div._child[0]
  assert.equal(span._lifecycle, 'built', 'native span 构建后 built')
  const frag = div._child[1]
  assert.equal(frag._lifecycle, 'built', 'Fragment 构建后 built')
  assert.equal(frag._child[0]._lifecycle, 'built', 'Fragment 内 native 也 built')
})

test('L6b: native dispose 标记 disposed', async () => {
  const { ctx } = setup()
  const tree = h('div', {}, [h('span', { class: 's' }, 'x')])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const span = (tree as any)._child[0]
  assert.equal(span._lifecycle, 'built')
  const { callRefCleanupFor } = await import('../ui-dom/vdom2/registry.ts')
  callRefCleanupFor(span, ctx.__registry)
  assert.equal(span._lifecycle, 'disposed', 'native 叶子 dispose 也标记 disposed')
})

test('L6c: 含异步子项的 native——resolve 后标 built', async () => {
  const { ctx } = setup()
  const Async = async (_i: any, _c: any) => (_p: any) => h('b', {}, 'async')
  const tree = h('div', {}, [h('span', {}, 'sync'), h(Async, {})])
  const built = await buildVNode(tree, ctx, null, ctx.__registry)
  const div = built as any
  assert.equal(div._lifecycle, 'built', 'native（含异步子项）resolve 后标 built')
})
