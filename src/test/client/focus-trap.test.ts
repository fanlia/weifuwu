/**
 * focus-trap 基础设施测试 — Tab 循环 / shift+Tab 反向 / 初始焦点 / cleanup 还原
 *
 * 注意（AGENTS.md）：jsdom 中未连接文档的元素 .focus() 无效——容器须
 * document.body.appendChild。dispatchEvent 用 jsdom 的 Event。
 */

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { trapFocus } from '../../ui-dom/focus-trap.ts'
const browser = createClientBrowser()

let container: HTMLElement

beforeEach(() => {
  container = browser.createElement('div')
  browser.bodyAppend(container)
})
afterEach(() => {
  container.remove()
})

function addFocusable(tag: string, id: string): HTMLElement {
  const el = browser.createElement(tag)
  el.id = id
  el.setAttribute('tabindex', '0')
  container.appendChild(el)
  return el
}

function tab(shift = false) {
  const ev = new (window as any).KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true })
  container.dispatchEvent(ev)
  return ev
}

test('空容器：trapFocus 返回 no-op cleanup', () => {
  const cleanup = trapFocus(container)
  assert.equal(typeof cleanup, 'function')
  cleanup()
})

test('初始聚焦第一个可聚焦元素（微任务）', async () => {
  const first = addFocusable('button', 'f1')
  addFocusable('button', 'f2')
  trapFocus(container)
  await new Promise<void>((r) => queueMicrotask(r))
  assert.equal(browser.activeElement(), first)
})

test('Tab 在最后一个元素时聚焦第一个（循环）', async () => {
  const first = addFocusable('button', 'f1')
  addFocusable('button', 'f2')
  const last = addFocusable('button', 'f3')
  const cleanup = trapFocus(container)
  await new Promise<void>((r) => queueMicrotask(r))
  last.focus()
  assert.equal(browser.activeElement(), last)
  tab(false)
  // jsdom 的 KeyboardEvent 不反映 defaultPrevented（已知限制），
  // 断言焦点移动效果（真实浏览器下 preventDefault 阻止默认 Tab 跳出）
  assert.equal(browser.activeElement(), first, '应循环回第一个')
  cleanup()
})

test('shift+Tab 在第一个元素时聚焦最后一个（反向循环）', async () => {
  const first = addFocusable('button', 'f1')
  addFocusable('button', 'f2')
  const last = addFocusable('button', 'f3')
  const cleanup = trapFocus(container)
  await new Promise<void>((r) => queueMicrotask(r))
  first.focus()
  tab(true)
  assert.equal(browser.activeElement(), last, '应反向循环到最后一个')
  cleanup()
})

test('Tab 在中间元素时正常不拦截（焦点不跳到首尾）', async () => {
  addFocusable('button', 'f1')
  const mid = addFocusable('button', 'f2')
  addFocusable('button', 'f3')
  const cleanup = trapFocus(container)
  await new Promise<void>((r) => queueMicrotask(r))
  mid.focus()
  tab(false)
  // 中间元素 Tab 不拦截——焦点不跳到 first（jsdom 无默认 Tab 行为，
  // 断言焦点仍在 mid 即说明 handler 未强制移动）
  assert.equal(browser.activeElement(), mid, '中间元素 Tab 不强制移动焦点')
  cleanup()
})

test('cleanup 还原焦点到 trap 前的 activeElement', async () => {
  const outside = browser.createElement('button')
  outside.id = 'outside'
  browser.bodyAppend(outside)
  outside.focus()
  assert.equal(browser.activeElement(), outside)

  addFocusable('button', 'f1')
  addFocusable('button', 'f2')
  const cleanup = trapFocus(container)
  await new Promise<void>((r) => queueMicrotask(r))
  assert.notEqual(browser.activeElement(), outside, 'trap 期间焦点在容器内')

  cleanup()
  assert.equal(browser.activeElement(), outside, 'cleanup 还原焦点')
  outside.remove()
})
