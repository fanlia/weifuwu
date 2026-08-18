/**
 * vdom core — build 阶段闭环测试（阶段 2）
 *
 * 覆盖：
 * - jsx-runtime 子路径（`<></>` 编译目标——jsx/jsxs/jsxDEV/Fragment）
 * - Fragment 编译形态渲染（`<>...</>` 多根展开）
 * - 组件输出 null → 占位锚（build 端到端——条件渲染组件）
 * - jsx 编译形态属性（className → class 通道）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../setup.ts'
import { h } from './vnode.ts'
import { jsx, jsxs, jsxDEV, Fragment } from '../jsx-runtime.ts'
import { renderToStream } from './build.ts'
import { CommandApplier } from './patch.ts'
import { createComponentRegistry } from './node/component.ts'
import type { Ctx } from '../context/Ctx.ts'

async function render(browser: ReturnType<typeof testBrowser>, tree: ReturnType<typeof h>) {
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const stream = renderToStream(tree, {} as Ctx, createComponentRegistry())
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    applier.apply(value)
  }
  return root
}

test('jsx-runtime：导出形状（jsx/jsxs/jsxDEV 函数 + Fragment 符号）', () => {
  assert.equal(typeof jsx, 'function')
  assert.equal(typeof jsxs, 'function')
  assert.equal(typeof jsxDEV, 'function')
  assert.ok(typeof Fragment === 'symbol')
})

test('jsx 编译形态：`<div className="x">text</div>` → vnode 纯数据 → 渲染', async () => {
  const browser = testBrowser()
  // 编译器产物：jsx(type, props, key)
  const v = jsx('div', { className: 'x', children: 'hello' })
  assert.equal(v.type, 'div')
  assert.equal(v.props.className, 'x')
  const root = await render(browser, v)
  assert.equal(root.querySelector('.x')?.textContent, 'hello')
})

test('Fragment 编译形态：`<>...</>` 多根展开（隐式 Fragment）', async () => {
  const browser = testBrowser()
  // 编译器产物：jsx(Fragment, { children: [...] })
  const v = jsx(Fragment, { children: [jsx('span', { class: 'a', children: '1' }), jsx('span', { class: 'b', children: '2' })] })
  const root = await render(browser, v)
  assert.equal(root.querySelectorAll('span').length, 2, '多根展开到 root')
  assert.equal(root.querySelector('.a')?.textContent, '1')
  assert.equal(root.querySelector('.b')?.textContent, '2')
})

test('jsxs 编译形态：多子节点（children 数组直传）', async () => {
  const browser = testBrowser()
  const v = jsxs('ul', { children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })] })
  const root = await render(browser, v)
  assert.equal(root.querySelectorAll('li').length, 2)
  assert.equal(root.querySelectorAll('li')[1].textContent, 'b')
})

test('组件输出 null → 占位锚（条件渲染组件——build 端到端）', async () => {
  const browser = testBrowser()
  const Empty = () => () => null
  const App = () => () => h('div', {}, [
    h('span', { class: 'a' }, 'a'),
    h(Empty, {}),
    h('span', { class: 'c' }, 'c'),
  ])
  const root = await render(browser, h(App, {}))
  const div = root.querySelector('div')!
  assert.equal(div.childNodes.length, 3, '3 子项 ⟷ 3 节点（null 输出占位锚）')
  assert.equal(div.childNodes[1].nodeType, 8, '组件输出 null → 注释占位')
  assert.equal(div.querySelector('.c')?.textContent, 'c')
})

test('build 全量流标记：done.full（patch 清理旧树多余节点）', async () => {
  const browser = testBrowser()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  // 全量流 1
  const s1 = renderToStream(h('div', {}, [h('span', {}, 'a'), h('span', {}, 'b')]), {} as Ctx, createComponentRegistry())
  const r1 = s1.getReader()
  while (true) { const { value, done } = await r1.read(); if (done) break; applier.apply(value) }
  assert.equal(root.querySelectorAll('span').length, 2)
  // 全量流 2（结构变化——b 消失——done.full 清理残留）
  const s2 = renderToStream(h('div', {}, h('span', {}, 'a')), {} as Ctx, createComponentRegistry())
  const r2 = s2.getReader()
  while (true) { const { value, done } = await r2.read(); if (done) break; applier.apply(value) }
  assert.equal(root.querySelectorAll('span').length, 1, 'done.full 清理旧树多余')
})
