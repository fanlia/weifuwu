/**
 * vdom2 并发剪枝缓存失效复现——父树剪枝与子组件自身 rerender 交错
 *
 * 真实事故（agent-platform Chat 页，2026-08）：文件生成后
 * `[vdom2] disposed 组件 EmptyState 在渲染——剪枝缓存失效——父树重建中（占位兜底）`
 *
 * 时序（file_updated WS 事件 → Chat rerender + FilesSection rerender 并发）：
 *   1. Chat build：FilesSection 剪枝 → FS_C._child = FS_B._child（旧输出 fsTree0，含 EmptyState）
 *   2. FS 自身 doRenderOne（registry 指向 FS_B）：build + patch → dispose fsTree0 里的 EmptyState，
 *      然后 FS_B._child = fsOutput1（新输出，无 EmptyState）
 *   3. Chat patch：compToComp 三态 skip 失败（FS_C._child=fsTree0 ≠ FS_B._child=fsOutput1）→
 *      patchValue(parent, oldNode, oldV._child=fsOutput1, childNew=fsTree0)——
 *      **old/new 语义反转**：已被 dispose 的旧树 fsTree0 被当新树 diff →
 *      holeToOther → renderValue(disposed EmptyState) → 警告 + 占位
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'

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
  return { ctx, root, d, registry }
}

/** EmptyState 类组件（无状态——被 dispose 的受害者） */
function EmptyStateLike(_init: any, _ctx: any) {
  return async () => h('div', { class: 'empty' }, '空目录')
}

/** FilesSection 类组件：showEmpty 时输出 EmptyState（空目录），否则 false（文件出现后） */
function FilesSectionLike(_init: any, _ctx: any) {
  return async (_props: any) => h('div', { class: 'fs' }, [
    h('div', { class: 'crumb' }, '面包屑'),
    _props.showEmpty ? h(EmptyStateLike, {}) : false,
    h('div', { class: 'entry' }, 'hello.js'),
  ])
}

/** Chat 类组件（父树）：包含 FilesSection 子组件 */
function ParentLike(_init: any, _ctx: any) {
  return async (props: any) => h('div', { class: 'p' }, [
    h('div', { class: 'body' }, props.msgCount ? [h('div', { class: 'msg' }, '消息')] : []),
    h(FilesSectionLike, { showEmpty: props.fsEmpty }),
  ])
}

test('并发剪枝缓存失效：父树剪枝 + 子组件自身 rerender dispose 共享旧树 → 不把 disposed 旧树当新树渲染', async () => {
  const { ctx, root } = setup()
  const warns: string[] = []
  const ow = console.warn.bind(console)
  console.warn = (...a: any[]) => { warns.push(String(a[0])); ow(...a) }
  try {
    // ── 首帧：msgs=[] + 空目录（EmptyState 渲染） ──
    const tree0 = h(ParentLike, { msgCount: 0, fsEmpty: true })
    await buildVNode(tree0, ctx, null, ctx.__registry)
    const node0 = renderValue(tree0, ctx, ctx.browser)
    if (node0) root.appendChild(node0)
    assert.ok(root.querySelector('.empty'), '首帧 EmptyState 渲染')
    const fsV = (tree0._child as any)._child[1] // Parent 输出 → FilesSection vnode

    // ── 步骤 1：Chat build（只 build 不 patch——剪枝 FS_C._child = fsTree0 共享） ──
    const tree1 = h(ParentLike, { msgCount: 1, fsEmpty: true })
    await buildVNode(tree1, ctx, tree0, ctx.__registry)
    const fsC = (tree1._child as any)._child[1]
    assert.notEqual(fsC, fsV, '新树 FilesSection vnode 是新对象')
    assert.equal(fsC._child, fsV._child, '剪枝共享 _child（fsTree0，含 EmptyState）')

    // ── 步骤 2：FilesSection 自身 doRenderOne（file_updated → 加载中渲染：EmptyState 消失）
    // 真实 doRenderOne 语义：patchValue(comp._parentNode ?? ref.parentNode, comp._refNode, oldChild, newChild)
    const fsOutput1 = h('div', { class: 'fs' }, [
      h('div', { class: 'crumb' }, '面包屑'),
      false,
      h('div', { class: 'entry' }, 'hello.js'),
    ])
    await buildVNode(fsOutput1, ctx, fsV._child, ctx.__registry)
    const fsAnchor = fsV._refNode as Element
    patchValue(fsV._parentNode ?? fsAnchor.parentNode, fsAnchor, fsV._child, fsOutput1, { browser: ctx.browser, registry: ctx.__registry })
    assert.ok(!root.querySelector('.empty'), 'EmptyState 已 dispose 移除')
    // dispose 掏空的是 EmptyState 组件 vnode（共享旧树 fsTree0 里的）——剪枝缓存失效点
    const e2 = (fsV._child as any)._child[1]
    assert.equal(e2._lifecycle, 'disposed', '共享旧树里的 EmptyState 被 dispose（剪枝缓存失效）')
    // doRenderOne 语义：registry vnode 的 _child 更新为新输出
    fsV._child = fsOutput1

    // ── 步骤 3：Chat patch（旧树 fsTree0 被 dispose 后，compToComp 把旧树当新树 diff） ──
    patchValue(root, root.firstChild, tree0, tree1, { browser: ctx.browser, registry: ctx.__registry })

    // 红线：disposed 旧树不得被当新树渲染（用户报告的占位兜底警告——renderValue 遇到 disposed）
    const disposedWarns = warns.filter((w) => w.includes('在渲染——剪枝缓存失效'))
    assert.deepEqual(disposedWarns, [], '不得把 disposed 旧树当新树渲染，实际: ' + warns.join(' | '))
    assert.ok(root.querySelector('.fs'), 'FilesSection 仍在')
    assert.ok(root.querySelector('.crumb'), 'FilesSection 输出保持（不被打回 EmptyState 占位）')

    // ── 步骤 4：下一轮 Chat build——canReuse 深检查拒绝剪枝 → FilesSection 完整重建恢复 ──
    const tree2 = h(ParentLike, { msgCount: 1, fsEmpty: false })
    await buildVNode(tree2, ctx, tree1, ctx.__registry)
    patchValue(root, root.firstChild, tree1, tree2, { browser: ctx.browser, registry: ctx.__registry })
    assert.ok(!root.querySelector('.empty'), '重建后 EmptyState 不再出现')
    assert.ok(root.querySelector('.entry'), '文件列表行保留')
    assert.equal(root.querySelectorAll('.fs').length, 1, 'FilesSection 单实例')
  } finally {
    console.warn = ow
  }
})

// ── 场景 2：disposed 在 oldV._child（旧树被另一会话部分清理，vnode 树与 DOM 脱节）──
// 真实事故（agent-platform 文件列表重复，2026-08）：文件生成后文件列表重复一份
// （"2 项" pill 双份 + 列表双份）。完整机制：
//   1. FS render#1（loading）：O_load = [面包屑, LoadingLike, false, ARR(4)] → FS_C0._child=O_load
//   2. Chat build#1：剪枝 FS_C1._child = O_load（共享）
//   3. FS render#2（loaded 5 项）：patch O_load→O_final：**dispose LoadingLike（在共享 O_load 里）**
//      + keyed 头部插 fifth → DOM 5 项；FS_C0._child=O_final
//   4. Chat build#2：canReuse(FS_C1) 深检查拒绝（O_load 含 disposed）→ FS_C2 完整重建（5 项干净）
//   5. Chat patch#2：compToComp(FS_C1→FS_C2)：oldV._child=O_load（含 disposed，vnode 树 4 项
//      与 DOM 5 项脱节）vs childNew=O_final'（5 项）→ 反转 diff → keyed 头部新增 fifth——
//      DOM 已有的 fifth 不在 oldInput vnode 树 → **重复插入 → 6 项**
// 修复：compToComp 双向检查（oldV._child 含 disposed 也跳过 diff——保留 DOM，下一轮收敛）

/** Loading 类组件（loading=true 时显示——FS render#2 的 patch 会 dispose 它） */
function LoadingLike(_init: any, _ctx: any) {
  return async () => h('div', { class: 'loading' }, '加载中')
}

/** 外部可变状态（模拟 FilesSection 内部 let loading/entries） */
const fsState = { loading: false, entries: [] as string[] }

/** 真实 FilesSection 结构：props 只有稳定 departmentId；Fragment 含面包屑/Loading/Empty/列表数组项 */
function FilesSectionLike2(_init: any, _ctx: any) {
  return async (_props: any) => h('div', { class: 'fs', id: 'sec-files' }, [
    h('div', { class: 'title' }, ['工作空间文件', fsState.entries.length > 0 && h('span', { class: 'pill' }, `${fsState.entries.length} 项`)]),
    h('div', { class: 'tip' }, '说明文字'),
    h(Fragment, {}, [
      h('div', { class: 'crumb' }, [h('button', { disabled: true }, '/')]),
      fsState.loading ? h(LoadingLike, {}) : false,
      !fsState.loading && fsState.entries.length === 0 ? h('div', { class: 'empty' }, '空目录') : false,
      fsState.entries.map((e: string) => h('div', { key: e, class: 'entry' }, e)),
    ]),
  ])
}

/** Chat 类组件（父树）：FS 的 props 稳定（departmentId）→ build 剪枝命中 */
function ParentLike2(_init: any, _ctx: any) {
  return async (props: any) => h('div', { class: 'p' }, [
    h('div', { class: 'body' }, props.msgCount ? h('div', { class: 'msg' }, '消息') : []),
    h(FilesSectionLike2, { departmentId: 'd1' }),
  ])
}

/** 模拟 FS doRenderOne：renderFn → build → patch → _child 更新 */
async function fsRenderOne(ctx: any, fsV: any, root: HTMLElement) {
  const output = await fsV._render(fsV.props)
  const built = await buildVNode(output, ctx, fsV._child, ctx.__registry)
  const old = fsV._child
  fsV._child = built
  const anchor = fsV._refNode as Element
  patchValue(fsV._parentNode ?? anchor.parentNode, anchor, old, built, { browser: ctx.browser, registry: ctx.__registry })
  return built
}

test('并发剪枝缓存失效（旧树侧）：FS 自身 rerender 部分清理共享旧树 → Chat 反转 diff 不得重复插入列表', async () => {
  const { ctx, root } = setup()
  const warns: string[] = []
  const ow = console.warn.bind(console)
  console.warn = (...a: any[]) => { warns.push(String(a[0])); ow(...a) }
  try {
    const old4 = ['fourth', 'hello', 'test2', 'third']
    const new5 = ['fifth', 'fourth', 'hello', 'test2', 'third']
    fsState.entries = old4
    fsState.loading = false
    // ── 首帧：4 项列表 ──
    const tree0 = h(ParentLike2, { msgCount: 0 })
    await buildVNode(tree0, ctx, null, ctx.__registry)
    const node0 = renderValue(tree0, ctx, ctx.browser)
    if (node0) root.appendChild(node0)
    assert.equal(root.querySelectorAll('.entry').length, 4, '首帧 4 项')
    const fsV = (tree0._child as any)._child[1]

    // ── 步骤 1：FS render#1（loading=true）：O_load（LoadingLike + 4 项） ──
    fsState.loading = true
    await fsRenderOne(ctx, fsV, root)
    assert.ok(root.querySelector('.loading'), 'Loading 显示')

    // ── 步骤 2：Chat build#1（只 build 不 patch）——剪枝 FS_C1._child = O_load 共享 ──
    const tree1 = h(ParentLike2, { msgCount: 1 })
    await buildVNode(tree1, ctx, tree0, ctx.__registry)
    const fsC1 = (tree1._child as any)._child[1]
    assert.equal(fsC1._child, fsV._child, 'Chat 剪枝共享 O_load（含 LoadingLike）')

    // ── 步骤 3：FS render#2（loaded 5 项）：patch 时 dispose LoadingLike（在共享 O_load 里）+ 插 fifth ──
    fsState.loading = false
    fsState.entries = new5
    await fsRenderOne(ctx, fsV, root)
    assert.equal(root.querySelectorAll('.entry').length, 5, 'FS render#2 后 DOM 5 项')
    assert.ok(!root.querySelector('.loading'), 'LoadingLike 已移除')
    // LoadingLike 被 dispose——它位于 Chat 共享的 O_load（fsC1._child）里：剪枝缓存失效点
    const fragOld = (fsC1._child as any)._child[2]
    assert.equal(fragOld._child[1]._lifecycle, 'disposed', '共享旧树里的 LoadingLike 被 dispose')

    // ── 步骤 4：Chat build#2——canReuse 深检查拒绝剪枝 → FS_C2 完整重建（5 项干净） ──
    const tree2 = h(ParentLike2, { msgCount: 1 })
    await buildVNode(tree2, ctx, tree1, ctx.__registry)
    const fsC2 = (tree2._child as any)._child[1]
    assert.notEqual(fsC2, fsC1, 'FS 重建（新 vnode）')
    assert.notEqual(fsC2._child, fsC1._child, '重建输出新树（不含 disposed）')

    // ── 步骤 5：Chat patch#2——compToComp(FS_C1→FS_C2)：oldV._child 含 disposed → 必须跳过 diff ──
    patchValue(root, root.firstChild, tree1, tree2, { browser: ctx.browser, registry: ctx.__registry })

    // 红线：列表不得重复（keyed 新增重复插入 = 旧树 vnode 与 DOM 脱节仍被当 diff 基准）
    const entries = [...root.querySelectorAll('.entry')].map((e) => e.textContent)
    assert.deepEqual(entries, new5, '文件列表不重复（修复前：fifth 重复插入 → 6 项）')
    assert.equal(root.querySelectorAll('.pill').length, 1, 'pill 单份')
    const disposedWarns = warns.filter((w) => w.includes('在渲染——剪枝缓存失效'))
    assert.deepEqual(disposedWarns, [], '不得渲染 disposed 组件，实际: ' + warns.join(' | '))

    // ── 步骤 6：后续 FS doRenderOne（registry 已指向 FS_C2）——收敛无重复 ──
    await fsRenderOne(ctx, fsC2, root)
    const entries2 = [...root.querySelectorAll('.entry')].map((e) => e.textContent)
    assert.deepEqual(entries2, new5, '后续渲染不再重复')
  } finally {
    console.warn = ow
    fsState.entries = []
    fsState.loading = false
  }
})
