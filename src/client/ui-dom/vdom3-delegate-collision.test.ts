/**
 * 事件代理 dispatch key 冲突回归（真实事故：components-demo Chart tooltip）
 *
 * dispatch 的 key 选择：`handlers.has(e.type) ? e.type : REVERSE_MAP[e.type]`——
 * 当页面同时存在直接键（onMouseOver → 'mouseover'）与映射键（onMouseEnter →
 * 'mouseenter'）时，真实 mouseover 事件只分发直接键，onMouseEnter 处理器被静默跳过。
 *
 * 真实场景：Tooltip demo（wrapProps.onMouseOver）与 Chart 数据点（onMouseEnter）
 * 同页共存——hover Chart 数据点 → mouseover 到挂载点 → handlers.has('mouseover')
 * 为真 → 只查 'mouseover' 注册表 → Chart 的 'mouseenter' 处理器永远不触发。
 *
 * 正确语义：mouseover 事件应同时分发直接键（mouseover）与反向映射键（mouseenter）
 * 两套处理器（它们语义不同——onMouseOver 每经过一个元素都触发，onMouseEnter 只在
 * 进入时触发——互不替代）。
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { h } from './vdom3/index.ts'

before(setupJsdom)

test('mouseover 同时触发 onMouseOver 与 onMouseEnter（直接键 + 映射键并存）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('./vdom3/root.ts')
  let over = 0
  let entered = 0
  const App = async (_init: any) => async () =>
    h('div', { id: 'wrap', onMouseOver: () => { over++ } }, [
      h('span', { id: 'hot', onMouseEnter: () => { entered++ } }, 'hot'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const hot = root.querySelector('#hot') as HTMLElement
  hot.dispatchEvent(new (window as any).MouseEvent('mouseover', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(over, 1, `onMouseOver 应触发——实际 ${over}`)
  assert.equal(entered, 1, `onMouseEnter 应触发（映射键不能被直接键挤掉）——实际 ${entered}`)
  document.body.removeChild(root)
})

test('mouseout 同时触发 onMouseOut 与 onMouseLeave', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('./vdom3/root.ts')
  let out = 0
  let left = 0
  const App = async (_init: any) => async () =>
    h('div', { id: 'wrap', onMouseOut: () => { out++ } }, [
      h('span', { id: 'hot', onMouseLeave: () => { left++ } }, 'hot'),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const hot = root.querySelector('#hot') as HTMLElement
  hot.dispatchEvent(new (window as any).MouseEvent('mouseout', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(out, 1, `onMouseOut 应触发——实际 ${out}`)
  assert.equal(left, 1, `onMouseLeave 应触发——实际 ${left}`)
  document.body.removeChild(root)
})

test('无直接键时 mouseover 仍映射触发 onMouseEnter（既有回归不破坏）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('./vdom3/root.ts')
  let entered = 0
  const App = async (_init: any) => async () =>
    h('div', {}, [
      h('svg', { width: 100, height: 100 }, [
        h('circle', { id: 'dot', cx: 10, cy: 10, r: 5, onMouseEnter: () => { entered++ } }),
      ]),
    ])
  const handle = createRoot(h(App, {}), root)
  await handle.ready
  const dot = root.querySelector('#dot') as HTMLElement
  dot.dispatchEvent(new (window as any).MouseEvent('mouseover', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(entered, 1, `svg 内 circle 映射触发——实际 ${entered}`)
  document.body.removeChild(root)
})
