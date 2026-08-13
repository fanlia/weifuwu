/**
 * 数组中的组件输出 null（值层有值、渲染层无输出）→ 占位法补全
 *
 * §6.3 占位法缺口修复：数组项是组件、组件 render 返回 null 时——
 * - 渲染侧：建占位（childNodes 恒与数组同构——diff oldNodes 映射不漂移）
 * - diff 侧：组件 null → 有内容 → null 恢复不抛错（compToComp 清 _refNode 防 stale）
 * - SSR/hydrate：占位注释同构输出/收养
 *
 * 触发场景：搜索过滤（Section 在「有内容 ↔ null」间切换——demo 实测
 * insertBefore NotFoundError 渲染中断的根因）
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h } from '../ui-dom/vnode.ts'
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
  return { ctx, root }
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

/** 条件渲染组件：flag 控制输出 null 或内容 */
function Conditional(initProps: any, _c: any) {
  return (props: any) => (props.flag ? h('span', { 'data-c': props.label }, props.label) : null)
}

test('N1: 渲染——数组中间组件输出 null → 建占位（childNodes 与数组同构）', async () => {
  const { ctx, root } = setup()
  const tree = h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag: false, label: 'x' }),
    h('i', { id: 'b' }, 'B'),
  ])
  await mount(ctx, root, tree)
  const el = root.querySelector('div')!
  assert.equal(el.childNodes.length, 3, 'childNodes.length 恒等于数组长度（含占位）')
  const hole = el.childNodes[1] as Comment
  assert.equal(hole.nodeType, 8, '位置 1 是占位注释（组件输出 null）')
  assert.ok(hole.nodeValue?.includes('type=hole'), '占位标记: ' + hole.nodeValue)
  assert.equal((el.childNodes[0] as Element).id, 'a')
  assert.equal((el.childNodes[2] as Element).id, 'b')
})

test('N2: diff——组件 null → 有内容 → null 恢复，不抛错且 DOM 正确', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag: false, label: 'x' }),  // 输出 null（占位）
    h('i', { id: 'b' }, 'B'),
  ])
  await mount(ctx, root, oldTree)

  // null → 有内容（搜索清空：Section 恢复）
  const midTree = h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag: true, label: 'x' }),
    h('i', { id: 'b' }, 'B'),
  ])
  await rerender(ctx, root, oldTree, midTree)
  assert.equal(root.querySelector('[data-c="x"]')!.textContent, 'x', '组件从 null 恢复渲染内容')
  assert.equal(root.querySelectorAll('div')[0].childNodes.length, 3, '恢复后同构')

  // 有内容 → null（搜索过滤：Section 隐藏）
  const backTree = h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag: false, label: 'x' }),
    h('i', { id: 'b' }, 'B'),
  ])
  await rerender(ctx, root, midTree, backTree)
  assert.equal(root.querySelectorAll('div')[0].childNodes.length, 3, '隐藏后仍是 3 个槽位（占位）')
  assert.equal((root.querySelectorAll('div')[0].childNodes[1] as Comment).nodeType, 8, '位置 1 恢复为占位')
})

test('N3: diff——搜索式多轮切换（null→有→null→有）不抛错、无 stale 引用', async () => {
  const { ctx, root } = setup()
  const mk = (flag: boolean) => h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag, label: 'x' }),
    h('i', { id: 'b' }, 'B'),
  ])
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    let tree = mk(false)
    await mount(ctx, root, tree)
    for (let i = 0; i < 3; i++) {
      tree = mk(true)
      await rerender(ctx, root, tree === mk(true) && false ? tree : await buildVNode(mk(true), ctx, tree, ctx.__registry) as any, tree)
      // 简化：交替切换
      tree = mk(i % 2 === 0)
      await rerender(ctx, root, tree, await buildVNode(mk(true), ctx, tree, ctx.__registry) as any)
      tree = mk(false)
      await rerender(ctx, root, tree, await buildVNode(mk(false), ctx, tree, ctx.__registry) as any)
    }
  } finally {
    console.error = orig
  }
  const real = errs.filter((e) => e.includes('render error'))
  assert.deepEqual(real, [], '多轮 null 切换不得渲染错误，实际: ' + errs.join(' | '))
})

test('N4: 无 key 数组（unkeyed）中组件输出 null → 头部删除不错位', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [
    h(Conditional, { flag: false, label: 'hide' }),  // null 占位在位置 0
    h('i', { id: 'b' }, 'B'),
  ])
  await mount(ctx, root, oldTree)
  // 头部插入一个元素：位置 0 占位 → 真实
  const newTree = h('div', {}, [
    h('i', { id: 'a' }, 'A'),
    h(Conditional, { flag: false, label: 'hide' }),
    h('i', { id: 'b' }, 'B'),
  ])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelectorAll('div')[0].childNodes.length, 3)
  assert.equal(root.querySelector('#a')!.textContent, 'A')
  assert.equal(root.querySelector('#b')!.textContent, 'B')
})

test('N5: SSR——组件输出 null 输出占位注释（与客户端同构）', async () => {
  const { ssrToString } = await import('../ui-dom/vdom2/ssr.ts')
  const html = await ssrToString(
    (() => () => h('div', {}, [h('i', {}, 'A'), h(Conditional, { flag: false, label: 'x' }), h('i', {}, 'B')])) as any,
    {},
    {},
  )
  assert.ok(html.includes('type=hole'), 'SSR 数组组件输出 null → 占位注释: ' + html.slice(0, 160))
  assert.ok(html.includes('A') && html.includes('B'))
})

test('N6: hydrate——SSR 占位收养后保留（与 SPA 同构）', async () => {
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

  const { ssrToString } = await import('../ui-dom/vdom2/ssr.ts')
  const { hydrateVNode } = await import('../ui-dom/vdom2/hydrate.ts')
  const html = await ssrToString(
    (() => () => h('div', { id: 'w' }, [h('i', {}, 'A'), h(Conditional, { flag: false, label: 'x' }), h('i', {}, 'B')])) as any,
    {},
    {},
  )
  root.innerHTML = html
  const vnode = h('div', { id: 'w' }, [h('i', {}, 'A'), h(Conditional, { flag: false, label: 'x' }), h('i', {}, 'B')])
  // container = 外部容器（vnode 的父）——游标从 container.firstChild（div#w）匹配 vnode.type 'div'
  await hydrateVNode(root, vnode, ctx)
  const w = root.querySelector('#w')!
  assert.equal(w.childNodes.length, 3, 'hydrate 后槽位与数组同构（占位保留）')
  assert.equal((w.childNodes[1] as Comment).nodeType, 8, '位置 1 是占位注释')
  assert.equal(w.childNodes[0].textContent, 'A')
  assert.equal(w.childNodes[2].textContent, 'B')
})
