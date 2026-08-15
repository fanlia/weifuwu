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
