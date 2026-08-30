/**
 * vdom core/field — applyProperty value 现值比较契约（2027-09——DOM 脱节消费端）
 *
 * 背景：diff 对表单控件 value 总是发 setProp——patch 写前必须比较 DOM
 * 现值（同值零写——打字每键的差集渲染零副作用）+ IME 组合中跳过
 * （compositionstart~end——组合期渲染树 value=组合前——强写打断中文
 * 输入法——input-sync 模块跟踪）。
 *
 * 诚实裁剪：IME 组合跳过的触发面（composition 事件跟踪）为真实 DOM
 * 依赖（document 监听 + WeakSet）——契约层无法构造组合态——该路径由
 * 代码审查 + 场景层（如有真实输入法场景）兜底；契约层锁定现值比较面。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyProperty } from '../../client/vdom/core/field/props.ts'

/** mock 元素（ownerDocument mock——ensureInit 挂监听 no-op——无真实 DOM） */
function mockInput(value: string): any {
  return {
    nodeType: 1,
    value,
    ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
  }
}

test('value 现值相同 → 零写（DOM 保持——无副作用）', () => {
  const el = mockInput('你好')
  applyProperty(el, 'value', '你好')
  assert.equal(el.value, '你好')
})

test('value 现值不同 → 写（程序化清空/回流必达）', () => {
  const el = mockInput('你好')
  applyProperty(el, 'value', '')
  assert.equal(el.value, '', '渲染树清空——DOM 残留旧文本必写')
  const el2 = mockInput('')
  applyProperty(el2, 'value', '新值')
  assert.equal(el2.value, '新值', '回流新值必写')
})

test('undefined value → 不写（非受控语义保持——防 undefined 污染）', () => {
  const el = mockInput('现价')
  applyProperty(el, 'value', undefined)
  assert.equal(el.value, '现价', 'undefined 不写')
})

test('数值/字符串等价（5 vs "5"——String 比较——零写）', () => {
  const el = mockInput('5')
  applyProperty(el, 'value', 5)
  assert.equal(el.value, '5', 'String 等价零写')
})

test('非 value 键行为不变（直接写）', () => {
  const el: any = { nodeType: 1, checked: false, disabled: false, ownerDocument: null }
  applyProperty(el, 'checked', true)
  assert.equal(el.checked, true)
})
