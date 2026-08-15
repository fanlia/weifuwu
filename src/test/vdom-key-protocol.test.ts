/**
 * key 业务身份声明协议（取消自动加 key）——三场景矩阵测试
 *
 * 协议（design 归档）：框架不生成身份 key——
 * - 用户不定义 key → 位置身份（unkeyed 按位置 patch；混合数组由 pos: 显式接管）
 * - 用户定义全部 key → 内容身份（keyed 按 key 匹配，增删/重排身份保持）
 * - 用户定义部分 key → 混合（无 key 项 pos: 位置匹配，不重建不冲突）
 *
 * 三个场景 + A 级动态检测（长度变化 + 无 key 组件项 → dev error）。
 * 回归：S2 重名冲突（无 key 项与显式 key 同值）残留、S4 表头复制行事故。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import { h } from '../ui-dom/vnode.ts'
import { __resetAuditWarnings } from '../ui-dom/vdom2/patch.ts'
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
  return { ctx, root, d, dom }
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

/** 有内部状态的组件（mount 闭包状态——验证实例复用/重建） */
function Stateful(initProps: any, _c: any) {
  let state = initProps.state ?? ''
  return (props: any) => h('span', { 'data-state': state, 'data-label': props.label }, `[${state}]${props.label}`)
}

// ── 场景 1：用户不定义 key（全无 key → 位置身份） ──

test('S1a: 全无 key——build 不注入自动 key（key 保持 null）', async () => {
  const { ctx } = setup()
  const tree = h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b'), h('span', {}, 'c')])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const keys = (tree as any)._child.map((c: any) => c.key)
  assert.deepEqual(keys, [null, null, null], '无 key 项必须保持 null——框架不生成身份 key')
})

test('S1b: 全无 key——首帧不写 data-wf-key（DOM 无位置 key 标注）', async () => {
  const { ctx, root } = setup()
  const tree = h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b')])
  await mount(ctx, root, tree)
  assert.equal(root.innerHTML, '<div><span>a</span><span>b</span></div>')
  assert.equal(root.querySelectorAll('[data-wf-key]').length, 0)
})

test('S1c: 全无 key——重渲染按位置 patch 复用（DOM 引用不变）', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [h('span', { id: 'a' }, 'a'), h('span', { id: 'b' }, 'b')])
  await mount(ctx, root, oldTree)
  const elA1 = root.querySelector('#a')!
  const newTree = h('div', {}, [h('span', { id: 'a' }, 'a1'), h('span', { id: 'b' }, 'b')])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelector('#a')!, elA1, '位置 0 的 DOM 节点必须复用（位置身份 patch）')
  assert.equal(root.querySelector('#a')!.textContent, 'a1')
})

test('S1d: 全无 key——头部删除按位置 patch（内容覆盖，节点数正确）', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [h('span', { 'data-i': '0' }, 'x'), h('span', { 'data-i': '1' }, 'y'), h('span', { 'data-i': '2' }, 'z')])
  await mount(ctx, root, oldTree)
  const newTree = h('div', {}, [h('span', { 'data-i': '1' }, 'y'), h('span', { 'data-i': '2' }, 'z')])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelectorAll('span').length, 2, '删除后节点数正确')
  assert.equal(root.querySelectorAll('span')[0].textContent, 'y')
  assert.equal(root.querySelectorAll('span')[1].textContent, 'z')
})

test('S1e: 全无 key——静态组件列表（长度不变）零告警', async () => {
  const { ctx, root } = setup()
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    const oldTree = h('div', {}, [h(Stateful, { state: 's0', label: 'a' }), h(Stateful, { state: 's1', label: 'b' })])
    await mount(ctx, root, oldTree)
    const newTree = h('div', {}, [h(Stateful, { state: 's0', label: 'a1' }), h(Stateful, { state: 's1', label: 'b1' })])
    await rerender(ctx, root, oldTree, newTree)
  } finally {
    console.error = orig
  }
  assert.equal(errs.length, 0, '静态列表（长度不变）不得触发动态检测告警')
})

// ── 场景 2：用户定义全部 key（全 keyed → 内容身份） ──

test('S2a: 全 keyed——key 保持用户值（字符串化）', async () => {
  const { ctx } = setup()
  const tree = h('div', {}, [h('span', { key: 'a' }, 'a'), h('span', { key: 'b' }, 'b')])
  await buildVNode(tree, ctx, null, ctx.__registry)
  const keys = (tree as any)._child.map((c: any) => c.key)
  assert.deepEqual(keys, ['a', 'b'], '用户显式 key 原样保留')
})

test('S2b: 全 keyed——头部删除身份保持（B/C 实例复用、A 卸载）', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [
    h(Stateful, { state: 'S-A', label: 'A', key: 'a' }),
    h(Stateful, { state: 'S-B', label: 'B', key: 'b' }),
    h(Stateful, { state: 'S-C', label: 'C', key: 'c' }),
  ])
  await mount(ctx, root, oldTree)
  const idB1 = root.querySelector('[data-label="B"]')!.getAttribute('data-wf-id')
  const idC1 = root.querySelector('[data-label="C"]')!.getAttribute('data-wf-id')
  assert.ok(idB1 && idC1)

  // 删除 A → [B, C]
  const newTree = h('div', {}, [
    h(Stateful, { state: 'S-B', label: 'B', key: 'b' }),
    h(Stateful, { state: 'S-C', label: 'C', key: 'c' }),
  ])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelectorAll('span').length, 2)
  const idB2 = root.querySelector('[data-label="B"]')!.getAttribute('data-wf-id')
  const idC2 = root.querySelector('[data-label="C"]')!.getAttribute('data-wf-id')
  assert.equal(idB2, idB1, 'B 实例身份保持（key 匹配）')
  assert.equal(idC2, idC1, 'C 实例身份保持（key 匹配）')
  // 状态不继承错位：B 实例仍是 S-B（未继承 A 的 S-A）
  assert.equal(root.querySelector('[data-label="B"]')!.getAttribute('data-state'), 'S-B')
})

test('S2c: 全 keyed——重排身份保持（实例复用 + DOM 顺序正确）', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [
    h(Stateful, { state: 'S-A', label: 'A', key: 'a' }),
    h(Stateful, { state: 'S-B', label: 'B', key: 'b' }),
  ])
  await mount(ctx, root, oldTree)
  const idA1 = root.querySelector('[data-label="A"]')!.getAttribute('data-wf-id')
  // 重排 [B, A]
  const newTree = h('div', {}, [
    h(Stateful, { state: 'S-B', label: 'B', key: 'b' }),
    h(Stateful, { state: 'S-A', label: 'A', key: 'a' }),
  ])
  await rerender(ctx, root, oldTree, newTree)
  const labels = [...root.querySelectorAll('span')].map((s) => s.getAttribute('data-label'))
  assert.deepEqual(labels, ['B', 'A'], 'DOM 顺序 = new 数组顺序')
  assert.equal(root.querySelector('[data-label="A"]')!.getAttribute('data-wf-id'), idA1, '重排后 A 实例保持')
})

// ── 场景 3：用户定义部分 key（混合 → 无 key 项 pos: 接管，不重建不冲突） ──

test('S3a: 混合——无 key 项（header）被 pos: 分配，重渲染不重建（DOM 引用不变）', async () => {
  const { ctx, root } = setup()
  const row = (id: string, v: string) => h('span', { key: `r-${id}`, 'data-v': v }, v)
  const oldTree = h('div', {}, [h('input', { id: 'h', placeholder: '搜索' }), row('a', 'A'), row('b', 'B')])
  await mount(ctx, root, oldTree)
  const input1 = root.querySelector('#h')!
  const newTree = h('div', {}, [h('input', { id: 'h', placeholder: '搜索' }), row('a', 'A1'), row('b', 'B1')])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelector('#h')!, input1, '混合数组无 key 项必须复用 DOM（pos: 接管，不重建）')
  assert.equal(root.querySelector('[data-v="A1"]')!.textContent, 'A1')
  assert.equal(root.querySelector('[data-v="B1"]')!.textContent, 'B1')
})

test('S3b: S4 回归——[header(无key), row(key="0")] 表头复制行事故已修复', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [
    h('span', { id: 'header' }, 'HEADER'),
    h('span', { id: 'r0', key: '0' }, 'row0'),
    h('span', { id: 'r1', key: '1' }, 'row1'),
  ])
  await mount(ctx, root, oldTree)
  // 中间插入 rowX(key="2")
  const newTree = h('div', {}, [
    h('span', { id: 'header' }, 'HEADER'),
    h('span', { id: 'r0', key: '0' }, 'row0'),
    h('span', { id: 'rx', key: '2' }, 'rowX'),
    h('span', { id: 'r1', key: '1' }, 'row1'),
  ])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelectorAll('#header').length, 1, 'header 不得复制')
  assert.equal(root.querySelectorAll('#r0').length, 1, 'row0 不得消失')
  const ids = [...root.querySelectorAll('span')].map((s) => s.id).filter(Boolean)
  assert.deepEqual(ids, ['header', 'r0', 'rx', 'r1'], '顺序与内容正确')
})

test('S3c: S2 回归——[A(无key), B(key="0")] 删除 A 不残留', async () => {
  const { ctx, root } = setup()
  const oldTree = h('div', {}, [h('span', { id: 'A' }, 'A'), h('span', { id: 'B', key: '0' }, 'B')])
  await mount(ctx, root, oldTree)
  const newTree = h('div', {}, [h('span', { id: 'B', key: '0' }, 'B')])
  await rerender(ctx, root, oldTree, newTree)
  assert.equal(root.querySelectorAll('span').length, 1, '删除后只剩 B')
  assert.equal(root.querySelector('#B')!.textContent, 'B')
  assert.equal(root.querySelector('#A'), null, 'A 不得残留')
})

// ── A 级动态检测（长度变化 + 无 key 组件项 → dev error） ──

test('A1: 长度变化 + 无 key 组件项 → console.error 提示加 key', async () => {
  const { ctx, root } = setup()
  __resetAuditWarnings() // 去重隔离（module 级 Set 跨测试污染）
  ;(globalThis as any).__WF_VDOM_AUDIT = true
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    const oldTree = h('div', {}, [h(Stateful, { state: 'x', label: 'x' }), h(Stateful, { state: 'y', label: 'y' })])
    await mount(ctx, root, oldTree)
    const newTree = h('div', {}, [h(Stateful, { state: 'y', label: 'y' })])
    await rerender(ctx, root, oldTree, newTree)
  } finally {
    console.error = orig
    delete (globalThis as any).__WF_VDOM_AUDIT
  }
  assert.ok(errs.some((e) => e.includes('动态数组')), '头部删除 + 无 key 组件项必须报错，实际: ' + errs.join(' | '))
})

test('A2: 长度变化 + 无 key native 项 → 不报错（native 无状态豁免）', async () => {
  const { ctx, root } = setup()
  ;(globalThis as any).__WF_VDOM_AUDIT = true
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    const oldTree = h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b')])
    await mount(ctx, root, oldTree)
    const newTree = h('div', {}, [h('span', {}, 'b')])
    await rerender(ctx, root, oldTree, newTree)
  } finally {
    console.error = orig
    delete (globalThis as any).__WF_VDOM_AUDIT
  }
  assert.equal(errs.length, 0, 'native 元素列表豁免（位置 patch 永远正确）')
})

test('A3: 长度不变 + 无 key 组件项 → 不报错（静态列表）', async () => {
  const { ctx, root } = setup()
  ;(globalThis as any).__WF_VDOM_AUDIT = true
  const errs: string[] = []
  const orig = console.error
  console.error = (...a: any[]) => errs.push(String(a[0]))
  try {
    const oldTree = h('div', {}, [h(Stateful, { state: 'x', label: 'x' }), h(Stateful, { state: 'y', label: 'y' })])
    await mount(ctx, root, oldTree)
    const newTree = h('div', {}, [h(Stateful, { state: 'x', label: 'x1' }), h(Stateful, { state: 'y', label: 'y1' })])
    await rerender(ctx, root, oldTree, newTree)
  } finally {
    console.error = orig
    delete (globalThis as any).__WF_VDOM_AUDIT
  }
  assert.equal(errs.length, 0, '静态列表（长度不变）不得报错')
})
