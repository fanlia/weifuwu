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
import { applySetProp } from '../../client/vdom/core/patch/fields.ts'

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

test('函数面统一（core2 探索移植）：非事件函数不写 attribute——DOM 干净', () => {
  const el = { nodeType: 1, attrs: new Map(), setAttribute(k: string, v: unknown) { this.attrs.set(k, v) }, removeAttribute(k: string) { this.attrs.delete(k) } } as unknown as HTMLElement
  const registry = { set() {}, removeEvent() {} } as never
  const fn = () => {}
  // create 路径：非事件函数 → 不写 attribute（原 String 化——有损——修正）
  applySetProp(registry, 'root.0', el, 'customFn', fn)
  assert.equal((el as unknown as { attrs: Map<string, unknown> }).attrs.has('customFn'), false, '非事件函数不写 attribute')
  // 事件照常（事件表通道）
  let setArgs: unknown = null
  const evReg = { set: (id: string, name: string, v: unknown) => { setArgs = [id, name, v] }, removeEvent() {} } as never
  applySetProp(evReg, 'root.0', el, 'onClick', fn)
  assert.deepEqual(setArgs, ['root.0', 'click', fn], '事件走事件表（不受函数面统一影响）')
  // 解绑（prev 函数 + undefined）→ 跳过（无 attribute 残留——从未写）
  const el2 = { nodeType: 1, attrs: new Map(), setAttribute(k: string, v: unknown) { this.attrs.set(k, v) }, removeAttribute(k: string) { this.attrs.delete(k) } } as unknown as HTMLElement
  applySetProp(registry, 'root.0', el2, 'customFn', undefined, fn)
  assert.equal((el2 as unknown as { attrs: Map<string, unknown> }).attrs.has('customFn'), false, '函数解绑无 DOM 操作')
  // 普通属性删除不受影响（undefined + 非函数 prev → attribute 删除路径）
  const el3 = { nodeType: 1, attrs: new Map([['class', 'a']]), setAttribute(k: string, v: unknown) { this.attrs.set(k, v) }, removeAttribute(k: string) { this.attrs.delete(k) } } as unknown as HTMLElement
  applySetProp(registry, 'root.0', el3, 'class', undefined, 'a')
  assert.equal((el3 as unknown as { attrs: Map<string, unknown> }).attrs.has('class'), false, '普通属性删除照常')
})
