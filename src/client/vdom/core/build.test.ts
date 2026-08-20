/**
 * vdom core — build 阶段闭环测试（阶段 2）
 *
 * 覆盖：
 * - jsx-runtime 子路径（`<></>` 编译目标——jsx/jsxs/jsxDEV/Fragment）
 * - Fragment 编译形态渲染（`<>...</>` 多根展开）
 * - 组件输出 null → 占位锚（build 端到端——条件渲染组件）
 * - jsx 编译形态属性（className → class 通道）
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { h } from './vnode.ts'
import { jsx, jsxs, jsxDEV, Fragment } from '../jsx-runtime.ts'
import { renderToStream } from './build.ts'
import { CommandApplier } from './patch/index.ts'
import { createComponentRegistry } from './node/component.ts'
import type { UIContext } from '../context/UIContext.ts'

async function render(tree: ReturnType<typeof h>) {
  const root = document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, document)
  const stream = renderToStream(tree, {} as UIContext, createComponentRegistry())
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  return root
}

test('jsx-runtime：导出形状（jsx/jsxs/jsxDEV 函数 + Fragment 符号）', () => {
  expect(typeof jsx).toBe('function')
  expect(typeof jsxs).toBe('function')
  expect(typeof jsxDEV).toBe('function')
  expect(typeof Fragment === 'symbol').toBeTruthy()
})

test('jsx 编译形态：`<div className="x">text</div>` → vnode 纯数据 → 渲染', async () => {
  // 编译器产物：jsx(type, props, key)
  const v = jsx('div', { className: 'x', children: 'hello' })
  expect(v.type).toBe('div')
  expect(v.props.className).toBe('x')
  const root = await render(v)
  expect(root.querySelector('.x')?.textContent).toBe('hello')
})

test('Fragment 编译形态：`<>...</>` 多根展开（隐式 Fragment）', async () => {
  // 编译器产物：jsx(Fragment, { children: [...] })
  const v = jsx(Fragment, { children: [jsx('span', { class: 'a', children: '1' }), jsx('span', { class: 'b', children: '2' })] })
  const root = await render(v)
  expect(root.querySelectorAll('span').length, '多根展开到 root').toBe(2)
  expect(root.querySelector('.a')?.textContent).toBe('1')
  expect(root.querySelector('.b')?.textContent).toBe('2')
})

test('jsxs 编译形态：多子节点（children 数组直传）', async () => {
  const v = jsxs('ul', { children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })] })
  const root = await render(v)
  expect(root.querySelectorAll('li').length).toBe(2)
  expect(root.querySelectorAll('li')[1].textContent).toBe('b')
})

test('组件输出 null → 占位锚（条件渲染组件——build 端到端）', async () => {
  const Empty = () => () => null
  const App = () => () => h('div', {}, [
    h('span', { class: 'a' }, 'a'),
    h(Empty, {}),
    h('span', { class: 'c' }, 'c'),
  ])
  const root = await render(h(App, {}))
  const div = root.querySelector('div')!
  expect(div.childNodes.length, '3 子项 ⟷ 3 节点（null 输出占位锚）').toBe(3)
  expect(div.childNodes[1].nodeType, '组件输出 null → 注释占位').toBe(8)
  expect(div.querySelector('.c')?.textContent).toBe('c')
})

test('build 全量流标记：done.full（patch 清理旧树多余节点）', async () => {
  const root = document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, document)
  // 全量流 1
  const s1 = renderToStream(h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b')]), {} as UIContext, createComponentRegistry())
  const r1 = s1.getReader()
  while (true) { const { value, done } = await r1.read(); if (done) break; applier.apply(value) }
  expect(root.querySelectorAll('span').length).toBe(2)
  // 全量流 2（结构变化——b 消失——done.full 清理残留）
  const s2 = renderToStream(h('div', {}, h('span', {}, 'a')), {} as UIContext, createComponentRegistry())
  const r2 = s2.getReader()
  while (true) { const { value, done } = await r2.read(); if (done) break; applier.apply(value) }
  expect(root.querySelectorAll('span').length, 'done.full 清理旧树多余').toBe(1)
})
