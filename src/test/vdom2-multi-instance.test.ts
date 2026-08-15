/**
 * vdom2 多实例共享 DOM 锚点复现——文件列表双份（agent-platform 真实事故 2026-08）
 *
 * 浏览器观察（bld-id/mount-stack 诊断）：
 *   - execute output 树只含 1 个 Chat/FS vnode（serve-dbg count=1）
 *   - 但首帧 build 时 Chat 的 renderFn 输出被**多次构建**（oldInput=null 的全新构建：
 *     ChatInput/FS 工厂各执行 3 次——mount-stack 实证）
 *   - 每次构建产生新 FS 实例（新 id 注册 registry；旧 id 未被 dispose/清理——
 *     buildComponent 只 set 不 delete）
 *   - 多代实例共享同一 DOM 锚点（compToComp 复用 DOM——fsB._refNode === fsA._refNode）
 *   - 旧实例的闭包回调（onFilesReload → loadWsList → rerender 绑旧 id）触发
 *     doRenderOne(旧 id) → 孤儿实例基于**与 DOM 脱节的旧 _child** patch 共享 DOM
 *     → keyed diff 插入新项、旧项无法感知移除 → 列表双份
 *
 * 本测试最小复现：两个实例共享 DOM 锚点（旧实例在树中、孤儿实例持有同一锚点）
 * → 孤儿实例 doRenderOne → 双份。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'
import { createRenderer } from '../ui-dom/vdom2/mount.ts'

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
  const ui: any = { _rootVNodeId: null, render: async () => {}, setMounting: () => {}, endMounting: () => {} }
  const ctx: any = { browser, __registry: registry, ui }
  const root = d.getElementById('root')!
  return { ctx, root, d, registry }
}

/** 外部可变状态（模拟 FilesSection 内部 let loading/entries——真实组件闭包） */
const fsState = { loading: false, entries: [] as string[] }

/** FilesSection 类组件：props 稳定（departmentId）；输出标题 pill + Fragment(面包屑/空态/列表数组项) */
function FilesSectionLike(_init: any, _ctx: any) {
  return async (_props: any) => h('div', { class: 'fs', id: 'sec-files' }, [
    h('div', { class: 'title' }, ['工作空间文件', fsState.entries.length > 0 && h('span', { class: 'pill' }, `${fsState.entries.length} 项`)]),
    h('div', { class: 'tip' }, '说明文字'),
    h(Fragment, {}, [
      h('div', { class: 'crumb' }, [h('button', { disabled: true }, '/')]),
      false,
      !fsState.loading && fsState.entries.length === 0 ? h('div', { class: 'empty' }, '空目录') : false,
      fsState.entries.map((e: string) => h('div', { key: e, class: 'entry' }, e)),
    ]),
  ])
}

/** Chat 类组件（父树）：props 只有 msgCount（FS 的 props 稳定 departmentId） */
function ChatLike(_init: any, _ctx: any) {
  return async (props: any) => h('div', { class: 'chat' }, [
    h('aside', { class: 'aside' }, [
      h('div', { class: 'aside-title' }, '交付物'),
      h(FilesSectionLike, { departmentId: 'd1' }),
      false,
    ]),
  ])
}

test('孤儿实例（构建期重复构建残留）doRenderOne 基于脱节旧树 patch 共享 DOM → 列表双份', async () => {
  const { ctx, root } = setup()
  const warns: string[] = []
  const ow = console.warn.bind(console)
  console.warn = (...a: any[]) => { warns.push(String(a[0])); ow(...a) }
  try {
    fsState.entries = []
    fsState.loading = false

    // ── 首帧 mount：chatA（FS_A：id A，空目录 EmptyState）──
    const chatA = h(ChatLike, { msgCount: 0 })
    await buildVNode(chatA, ctx, null, ctx.__registry)
    const nodeA = renderValue(chatA, ctx, ctx.browser)
    if (nodeA) root.appendChild(nodeA)
    assert.ok(root.querySelector('.empty'), '首帧空目录 EmptyState')
    const fsA = (chatA._child as any)._child[0]._child[1]
    const fsAId = fsA._id
    ctx.ui._rootVNodeId = (chatA as any)._id // renderPath 设置根组件 id

    // ── 构建期重复构建（oldInput=null）：产生孤儿实例 FS_B（新 id；未 patch 未落地）──
    // 真实现象：Chat 的 renderFn 输出被多次 build（mount-stack 实证）——第二次 build
    // 时内部状态已更新（loadWsList 完成）→ O_B 含 1 项
    fsState.entries = ['demo-verify.txt']
    fsState.loading = false
    const chatB = h(ChatLike, { msgCount: 0 })
    await buildVNode(chatB, ctx, null, ctx.__registry)
    const fsB = (chatB._child as any)._child[0]._child[1]
    assert.notEqual(fsB._id, fsAId, '重复构建产生新 FS 实例（新 id）')
    assert.ok(ctx.__registry.idRegistry.has(fsB._id), '新实例注册 registry')
    assert.ok(ctx.__registry.idRegistry.has(fsAId), '旧实例 id 仍在 registry（构建不清理——泄漏）')
    // 孤儿实例持有共享 DOM 锚点（多代实例共享——浏览器实证 fsB._refNode === fsA._refNode）
    fsB._refNode = fsA._refNode
    fsB._parentNode = fsA._parentNode

    // ── 树中实例 FS_A 正常 doRenderOne（loadWsList 完成 → 列表 1 项）──
    const renderer = createRenderer({ registry: ctx.__registry, ctx, rootEl: root })
    await renderer.render([fsAId])
    assert.deepEqual([...root.querySelectorAll('.entry')].map((e) => e.textContent), ['demo-verify.txt'], 'FS_A 渲染后列表 1 项')

    // ── 孤儿实例 FS_B doRenderOne（旧闭包回调触发——registry 里旧 id 仍指向孤儿）──
    await renderer.render([fsB._id])

    // 红线：列表不得双份（孤儿实例基于脱节旧树 patch 共享 DOM → keyed 重复插入）
    const entries = [...root.querySelectorAll('.entry')].map((e) => e.textContent)
    const pills = root.querySelectorAll('.pill').length
    assert.deepEqual(entries, ['demo-verify.txt'], '列表单份（修复前：孤儿实例重复插入 → 双份），实际: ' + JSON.stringify(entries))
    assert.equal(pills, 1, 'pill 单份（修复前：双份），实际: ' + pills)
    assert.ok(!root.querySelector('.empty'), 'EmptyState 已移除')
    assert.ok(!ctx.__registry.idRegistry.has(fsB._id), '孤儿实例注册已清理（防反复触发）')
    assert.ok(ctx.__registry.idRegistry.has(fsAId), '树中实例注册保留（正常渲染不受影响）')
  } finally {
    console.warn = ow
    fsState.entries = []
    fsState.loading = false
  }
})

// ── 根因测试：doRenderOne 的 building 守卫必须在 renderFn 之前 ──
// 真实事故（agent-platform 首帧 Chat 输出被重复构建 3 次）：组件工厂完成后（_render
// 已设）、父树构建完成前（lc=building），事件驱动渲染（WS 回包/fetch 完成/store 通知/
// 定时器）触发 doRenderOne——旧实现先执行 renderFn + buildVNode（子树组件再次 mount、
// 新 id——孤儿实例）才发现 building 跳过 patch。守卫前置：renderFn 前检查 building →
// 直接跳过（状态在闭包，下次渲染读到——语义等价）。

let buildChildMounts = 0
function SlowChild() {
  return async () => {
    buildChildMounts++
    await new Promise((r) => setTimeout(r, 30)) // 挂起构建——事件驱动渲染在 building 期间触发
    return h('div', { class: 'slow-child' }, 'child')
  }
}
function BuildingParent(_init: any, ctx: any) {
  return async () => {
    // 组件内部 ctx.ui.render()（childCtx 绑自身 id）——构建期触发 doRenderOne(自身)
    setTimeout(() => { void ctx.ui.render() }, 0)
    return h('div', { class: 'bp' }, [h(SlowChild, {})])
  }
}

test('构建期自渲染：doRenderOne 命中 building 组件 → 守卫前置阻止子树重复构建', async () => {
  const { ctx, root } = setup()
  buildChildMounts = 0
  // ctx.ui.render 必须接真实 renderer（mountAsyncComponent 的 childUi.render 转发到 ui.render）
  const renderer = createRenderer({ registry: ctx.__registry, ctx, rootEl: root })
  const origRender = ctx.ui.render
  ctx.ui.render = (ids?: string[]) => renderer.render(ids)
  try {
    const tree = h(BuildingParent, {})
    await buildVNode(tree, ctx, null, ctx.__registry)
    const node = renderValue(tree, ctx, ctx.browser)
    if (node) root.appendChild(node)
    await new Promise((r) => setTimeout(r, 100)) // 等待 setTimeout 触发的 doRenderOne + 构建完成
    assert.equal(buildChildMounts, 1, `构建期自渲染不得重复构建子树（旧实现：工厂执行 ${buildChildMounts} 次——孤儿实例来源）`)
    assert.equal(root.querySelectorAll('.slow-child').length, 1, '子树单实例')
  } finally {
    ctx.ui.render = origRender
  }
})

// ── Bug #3：构建期渲染请求不丢弃（pending 补跑）──
// 真实事故（agent-platform back 导航）：新 Chat 构建中（rootVNodeId 未更新）fetch 完成
// rerender → 被孤儿校验/SKIP_BUILDING 丢弃 → 无后续事件 → 消息永不加载（DOM 恒显「暂无消息」）。
// 修复：SKIP_BUILDING/SKIP_DETACHED 记入 pending——构建完成（渲染链落地/renderPath 完成）
// 后 flushPending 补跑（状态在闭包——补跑读最新值）。

let pendingChildMounts = 0
function PendingSlowChild() {
  return async () => {
    pendingChildMounts++
    await new Promise((r) => setTimeout(r, 30)) // 挂起构建——事件驱动渲染在 building 期间触发
    return h('div', { class: 'p-child' }, 'child')
  }
}
function PendingParent(_init: any, ctx: any) {
  let loaded = false
  setTimeout(() => { loaded = true; void ctx.ui.render() }, 0) // 模拟构建期 fetch 完成回调
  return async () => h('div', { class: 'pp' }, [
    h(PendingSlowChild, {}),
    loaded ? h('div', { class: 'loaded' }, 'DATA') : false,
  ])
}

test('构建期渲染请求 pending 补跑：构建完成（flushPending）后状态更新落地不丢失', async () => {
  const { ctx, root } = setup()
  const renderer = createRenderer({ registry: ctx.__registry, ctx, rootEl: root })
  const origRender = ctx.ui.render
  ctx.ui.render = (ids?: string[]) => renderer.render(ids)
  try {
    pendingChildMounts = 0
    const tree = h(PendingParent, {})
    // 模拟 renderPath：buildVNode（构建中 setTimeout 触发 render → SKIP_BUILDING + pending）
    await buildVNode(tree, ctx, null, ctx.__registry)
    const node = renderValue(tree, ctx, ctx.browser)
    if (node) root.appendChild(node)
    // 构建完成——但渲染请求已被 SKIP_BUILDING 拦截（pending 记录）
    await new Promise((r) => setTimeout(r, 60))
    assert.equal(root.querySelectorAll('.loaded').length, 0, '构建期渲染请求被跳过（尚未补跑）')
    // renderPath 完成 → flushPending → 补跑（读闭包 loaded=true → DATA 落地）
    await renderer.flushPending()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(root.querySelectorAll('.loaded').length, 1, 'pending 补跑后状态更新落地（修复前：渲染请求丢失 → DATA 永不出现）')
    assert.equal(pendingChildMounts, 1, '子树不重复构建（补跑是正常渲染——剪枝复用）')
  } finally {
    ctx.ui.render = origRender
  }
})
