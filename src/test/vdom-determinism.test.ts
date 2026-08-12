/**
 * vdom determinism 测试（design 归档 阶段 D-1）
 *
 * 可预测性：同一状态 → 同一 vnode → 同一 DOM——连续渲染结果一致、无重复节点、结构稳定。
 * ① 幂等渲染：同一 vnode 树连续 patch 两次 → DOM 快照一致（无重复/无残留）
 * ② 双树一致性：patch 后 vnode 结构 === DOM 结构（audit 零报错）
 * ③ 混排矩阵：空洞/Fragment/数组项/portal/keyed 全组合 patch 结果正确
 * ④ 锚点稳定：同类型组件跨 render _refNode 不漂移
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'
import { auditTree } from '../ui-dom/vdom2/audit.ts'

before(setupJsdom)
afterEach(() => createClientBrowser().clearBody())

async function makeCtx() {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return {
    reg,
    ctx: {
      browser,
      registry: reg,
      ctxVersion: 0,
      getCtxVersion: () => 0,
      ui: { _selfId: '_wf_root', setMounting: () => {}, endMounting: () => {} },
    },
  }
}

function mountEl(): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  return el
}

/** 渲染 vnode → 挂载 div，返回 { root, vnode, el } */
async function renderTree(vnode: any, ctx: any, reg: any) {
  await buildVNode(vnode, ctx, undefined, reg)
  const root = mountEl()
  const el = renderValue(vnode, ctx, ctx.browser)!
  root.appendChild(el)
  return { root, vnode, el }
}

// ── ① 幂等渲染 ──

test('幂等：同一结构连续 patch 两次 → DOM 快照一致（无重复节点）', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => (props: any) => h('span', { class: 'item' }, String(props.n))
  const mk = (ns: number[]) => h('div', { class: 'w' }, ns.map((n, i) => h(Item, { key: `k${i}`, n })))
  const { root } = await renderTree(mk([1, 2, 3]), ctx, reg)
  const el = root.firstChild as HTMLElement
  const snap1 = el.outerHTML
  // patch 同结构（新 vnode 树）
  const v2 = mk([1, 2, 3])
  await buildVNode(v2, ctx, (root as any).__v1 ?? undefined, reg)
  patchValue(root, root.firstChild, (root as any).__v1 ?? v2, v2, ctx)
  // 再次 patch 同结构
  const v3 = mk([1, 2, 3])
  await buildVNode(v3, ctx, v2, reg)
  patchValue(root, root.firstChild, v2, v3, ctx)
  assert.equal(el.outerHTML, snap1, '连续 patch 同结构 → DOM 快照一致（幂等）')
  assert.equal(el.querySelectorAll('.item').length, 3, '无重复节点')
})

// ── ② 双树一致性（audit 零报错） ──

test('双树一致：patch 后 auditTree 零报错（vnode 结构 === DOM 结构）', async () => {
  const { ctx, reg } = await makeCtx()
  const Btn = async (_init: any) => () => h('button', { class: 'b' }, 'x')
  const mk = (show: boolean) => h('div', {}, [h('span', { class: 'a' }, '1'), show ? h(Btn, { key: 'b' }) : false, h('span', { class: 'c' }, '2')])
  const v1 = mk(false)
  const { root } = await renderTree(v1, ctx, reg)
  const el = root.firstChild as HTMLElement
  assert.equal(el.childNodes.length, 3, '占位补齐')
  // false → Btn（占位→真实）
  const v2 = mk(true)
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  // Btn → false（真实→占位）
  const v3 = mk(false)
  await buildVNode(v3, ctx, v2, reg)
  patchValue(root, root.firstChild, v2, v3, ctx)
  const msgs: string[] = []
  auditTree(el, v3, (m) => msgs.push(m))
  assert.deepEqual(msgs, [], '占位往返后双树一致: ' + msgs.join(' | '))
  assert.equal(el.childNodes.length, 3)
})

// ── ③ 混排矩阵 ──

test('混排：空洞 + 数组项(Fragment) + keyed 列表同树 patch 正确', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => (props: any) => h('span', { class: 'item', 'data-k': props.k }, props.k)
  const mk = (show: boolean, ks: string[]) => h('div', { class: 'mx' }, [
    false,                                // 空洞
    [h('span', { class: 'na' }, 'a'), h('span', { class: 'nb' }, 'b')], // 数组项 ≡ Fragment
    show ? h('div', { class: 'flag' }, 'F') : false,
    ks.map((k) => h(Item, { key: k, k })),
  ])
  const v1 = mk(false, ['x', 'y'])
  const { root } = await renderTree(v1, ctx, reg)
  const el = root.firstChild as HTMLElement
  assert.equal(el.querySelectorAll('.item').length, 2)
  // 删除 y + 显示 flag + 新增 z
  const v2 = mk(true, ['x', 'z'])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const ks = [...el.querySelectorAll('.item')].map((s) => s.textContent)
  assert.deepEqual(ks, ['x', 'z'], 'keyed 增删正确')
  assert.equal(el.querySelectorAll('.flag').length, 1, 'flag 出现（占位→真实）')
  assert.equal(el.querySelectorAll('.na, .nb').length, 2, '数组项展开保留')
  const msgs: string[] = []
  auditTree(el, v2, (m) => msgs.push(m))
  assert.deepEqual(msgs, [], '混排 patch 后双树一致: ' + msgs.join(' | '))
})

// ── ④ 锚点稳定 ──

test('锚点稳定：同类型组件跨 render _refNode 不漂移', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => () => h('span', { class: 'stable' }, 's')
  const v1 = h('div', {}, [h(Item, { key: 's' })])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const ref1 = (v1.props.children as any[])[0]._refNode
  const v2 = h('div', {}, [h(Item, { key: 's' })])
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const newV = (v2.props.children as any[])[0]
  assert.ok(newV._refNode === ref1, '同 key 同类型 _refNode 不漂移')
  assert.ok(ref1.parentNode === root.firstChild, '锚点在父 DOM 内')
})
