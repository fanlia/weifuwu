/**
 * events 契约——事件 prop 判定（§6.4 事故回归）
 *
 * EVENT_RE = /^on[A-Z]/——`once`/`only` 等 on 开头属性不误判为事件
 * （历史真实 bug：diff.ts 曾用 key.startsWith('on')——addEventListener('ce', true)
 * 抛 TypeError 中断渲染）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENT_RE, eventName } from '../../client/vdom/core/field/events.ts'

test('EVENT_RE：on + 大写判定——普通属性/on 开头小写不误判', () => {
  assert.equal(EVENT_RE.test('onClick'), true, 'onClick 是事件')
  assert.equal(EVENT_RE.test('onMouseDown'), true)
  assert.equal(EVENT_RE.test('onChange'), true)
  assert.equal(EVENT_RE.test('once'), false, 'once 是属性（on + 小写——不误判）')
  assert.equal(EVENT_RE.test('only'), false, 'only 是属性（历史 bug：startsWith(on) 误判）')
  assert.equal(EVENT_RE.test('class'), false)
  assert.equal(EVENT_RE.test('on'), false, '裸 on 不是事件')
})

test('eventName：onClick → click（小写——事件名解析）', () => {
  assert.equal(eventName('onClick'), 'click')
  assert.equal(eventName('onMouseDown'), 'mousedown')
  assert.equal(eventName('onDoubleClick'), 'doubleclick', 'onDoubleClick → doubleclick（标准映射）')
  assert.equal(eventName('once'), null, '非事件返回 null')
  assert.equal(eventName('class'), null)
})
