/**
 * Phase 5b：portal 场景复现 demo bug（Button not built——Drawer 类组件）
 *
 * demo 实测：DemoDrawer 剪枝（pruned）后，输出 _child 里的 Button/Drawer 被
 * portal 内容独立 dispose（remoteEl 移除）→ 剪枝复用含 disposed 组件的输出 → diff 抛错。
 *
 * 复现：组件输出含 Portal（内容含组件）——多轮「隐藏(null)→恢复」切换。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h, createPortal } from '../ui-dom/vnode.ts'
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
  return { ctx, root, d }
}

async function mount(ctx: any, root: HTMLElement, tree: any) {
  await buildVNode(tree, ctx, null, ctx.__registry)
  const node = renderValue(tree, ctx, ctx.browser)
  if (node) root.appendChild(node)
}

async function rerender(ctx: any, root: HTMLElement, oldTree: any, newTree: any) {
  await buildVNode(newTree, ctx, oldTree, ctx.__registry)
  patchValue(root, root.firstChild, oldTree, newTree, { browser: ctx.browser, registry: ctx.__registry })
}

/** Drawer 类组件：输出含 Portal（内容含组件）——portal 内容独立清理场景 */
function DrawerLike(initProps: any, _c: any) {
  return (props: any) => {
    const panel = h('div', { class: 'panel' }, [h('button', {}, '取消'), h('button', {}, '保存')])
    return h('div', { class: 'wrap' }, [
      h('button', {}, '右侧抽屉'),
      createPortal(panel, 'drawer'),
    ])
  }
}

/** 可隐藏容器（Section 类）：hidden → null */
function SectionLike(initProps: any, _c: any) {
  return (props: any) => (props.hidden ? null : h('div', { class: 'sec' }, [h(DrawerLike, {}), h('span', {}, 'tail')]))
}

test('P1: 首帧渲染（含 portal 组件）无错误', async () => {
  const { ctx, root } = setup()
  const tree = h('div', {}, [h(SectionLike, { hidden: false })])
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    await mount(ctx, root, tree)
  } finally {
    console.error = orig
  }
  assert.equal(errs.filter(e => e.includes('render error')).length, 0, '首帧无渲染错误')
  assert.ok(root.querySelector('.sec'), 'Section 渲染')
})

test('P2: 搜索式多轮切换（隐藏→恢复）无渲染错误——portal 场景复现', async () => {
  const { ctx, root } = setup()
  const mk = (hidden: boolean) => h('div', {}, [h(SectionLike, { hidden })])
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    let tree = mk(false)
    await mount(ctx, root, tree)
    for (let i = 0; i < 4; i++) {
      tree = mk(true)
      await rerender(ctx, root, tree, tree)
      // 修正：交替切换（用新 vnode 树）
      const hidden = i % 2 === 0
      const next = mk(hidden)
      await rerender(ctx, root, tree, next)
      tree = next
    }
  } finally {
    console.error = orig
  }
  const real = errs.filter((e) => e.includes('render error'))
  assert.deepEqual(real, [], 'portal 多轮切换不得渲染错误，实际: ' + errs.join(' | '))
})
