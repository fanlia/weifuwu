/**
 * Checkbox 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（受控布尔——Switch 同族）：
 * - checked=false → checked 属性不渲染（关态——enumerated 属性面）
 * - checked=true → 属性渲染
 * - 事件函数不进 attrs（onChange 经事件表——契约 4）
 * - 受控回流：checked 翻转 → setProp（不重建——焦点保持前提）
 * - label 形态：无 label = [input, visual]；有 label = [input, visual, span]
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Checkbox } from './Checkbox.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('受控布尔：checked=false 关态（checked 不渲染）', async () => {
  const h = await mount(Checkbox, { checked: false })
  const ct = createTable(h.cmds)
  const input = [...ct.entries()].find(([, v]) => v.tag === 'input')?.[1]
  assert.ok(input, 'input 存在')
  assert.equal(input.attrs.checked, undefined, 'checked=false → 属性不渲染')
  assert.equal(input.attrs.onChange, undefined, 'onChange 不进 attrs（事件表通道）')
})

test('受控布尔：checked=true → 属性渲染（enumerated）', async () => {
  const h = await mount(Checkbox, { checked: true })
  const ct = createTable(h.cmds)
  const input = [...ct.entries()].find(([, v]) => v.tag === 'input')?.[1]
  assert.ok(input.attrs.checked !== undefined, 'checked 渲染')
})

test('受控回流：checked false→true → setProp（不重建）', async () => {
  const h = await mount(Checkbox, { checked: false })
  const cmds = await h.render({ checked: true })
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'checked'), 'setProp checked')
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建')
})

test('label 形态：label 文本渲染（span.wf-checkbox-label）', async () => {
  const h = await mount(Checkbox, { checked: false, label: '同意条款' })
  const textNodes = h.cmds.filter((c) => c.op === 'createText').map((c) => (c as any).value)
  assert.ok(textNodes.includes('同意条款'), `label 文本（实际: ${textNodes.join(',')}）`)
})
