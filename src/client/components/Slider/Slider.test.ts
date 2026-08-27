/**
 * Slider 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定：
 * - value/min/max/step 属性面（input range 语义）
 * - 受控回流：value 变化 → setProp（不重建——拖拽焦点保持前提）
 * - marks 标签渲染（map 项 keyed——步进标签）
 * - 事件函数不进 attrs（onChange/onInput 经事件表——契约 4）
 * - range 双 thumb（lo/hi 双 input）
 *
 * 运行：node --env-file=.env --test src/client/components/Slider/Slider.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Slider } from './Slider.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('首帧属性面：value/min/max/step（range input——受控数值类）', async () => {
  const h = await mount(Slider, { value: 60, min: 0, max: 100, step: 5 })
  const ct = createTable(h.cmds)
  const inputs = [...ct.entries()].filter(([, v]) => v.tag === 'input')
  assert.ok(inputs.length >= 1, 'range input 存在')
  const input = inputs[0][1]
  assert.equal(input.attrs.type, 'range', 'type=range')
  assert.equal(String(input.attrs.value), '60')
  assert.equal(String(input.attrs.max), '100')
  assert.equal(String(input.attrs.min), '0')
  assert.equal(String(input.attrs.step), '5')
  // 事件函数不进 attrs（事件表通道）
  assert.equal(input.attrs.onChange, undefined, 'onChange 不进 attrs')
})

test('受控回流：value 变化 → setProp（不重建——拖拽焦点保持前提）', async () => {
  const h = await mount(Slider, { value: 60, max: 100 })
  const cmds = await h.render({ value: 80, max: 100 })
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'value' && String((c as any).value) === '80'), 'setProp value=80')
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建')
})

test('marks 渲染：步进标签（label 文本——map 项）', async () => {
  const h = await mount(Slider, { value: 50, min: 0, max: 100, marks: [{ value: 0, label: '零' }, { value: 50, label: '中' }, { value: 100, label: '满' }] })
  const textNodes = h.cmds.filter((c) => c.op === 'createText').map((c) => (c as any).value)
  assert.ok(textNodes.includes('零') && textNodes.includes('中') && textNodes.includes('满'), `marks 文本（实际: ${textNodes.join(',')}）`)
})

test('range 双 thumb：lo/hi 双 range input', async () => {
  const h = await mount(Slider, { value: [20, 80], range: true, min: 0, max: 100 })
  const ct = createTable(h.cmds)
  const inputs = [...ct.entries()].filter(([, v]) => v.tag === 'input' && v.attrs.type === 'range')
  assert.ok(inputs.length >= 2, `range 双 input（实际: ${inputs.length}）`)
})
