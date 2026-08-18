/**
 * vdom core — 事件通道测试
 *
 * 锁定规则（AGENTS §6.4）：on + 大写判定（once/only 不误判）；事件名小写化；
 * 非函数值 warn + 跳过（不中断渲染管线）；prev 旧监听引用变化时解绑重绑。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { bindEvent, eventName, EVENT_RE } from './events.ts'

function el(): HTMLElement {
  return testBrowser().document.createElement('button')
}

test('事件判定：on + 大写（once/only 不误判）', () => {
  assert.ok(EVENT_RE.test('onClick'))
  assert.ok(EVENT_RE.test('onMouseDown'))
  assert.ok(!EVENT_RE.test('once'), 'once 不以大写开头——非事件')
  assert.ok(!EVENT_RE.test('only'))
  assert.ok(!EVENT_RE.test('onfocus'), 'on 后小写——非事件')
  assert.equal(eventName('onClick'), 'click')
  assert.equal(eventName('onMouseDown'), 'mousedown')
  assert.equal(eventName('once'), null)
})

test('事件绑定：click 触发（jsdom dispatchEvent）', () => {
  const e = el()
  let count = 0
  bindEvent(e, 'onClick', () => { count++ })
  e.click()
  assert.equal(count, 1, 'addEventListener 绑定生效')
})

test('非函数值：warn + 跳过（不抛 DOMException 中断渲染）', () => {
  const e = el()
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    bindEvent(e, 'onClick', true as unknown as EventListener)
  } finally {
    console.warn = origWarn
  }
  assert.equal(warns.length, 1, '明确 warn 提示')
  assert.match(warns[0], /onClick/, 'warn 带事件 prop 名')
  let count = 0
  e.addEventListener('click', () => { count++ })
  e.click()
  assert.equal(count, 1, '非函数值未注册监听——后续合法监听不受影响')
})

test('prev 旧监听：引用变化解绑 + 重绑（diff 重绑正确性）', () => {
  const e = el()
  let hits: string[] = []
  const h1 = () => { hits.push('h1') }
  const h2 = () => { hits.push('h2') }
  bindEvent(e, 'onClick', h1)
  e.click()
  assert.deepEqual(hits, ['h1'])
  bindEvent(e, 'onClick', h2, h1)   // prev 传旧引用 → 解绑 h1
  e.click()
  assert.deepEqual(hits, ['h1', 'h2'], 'h1 已解绑——仅 h2 触发')
  bindEvent(e, 'onClick', h2, h2)   // 同引用 → 不重复解绑
  e.click()
  assert.deepEqual(hits, ['h1', 'h2', 'h2'])
})
