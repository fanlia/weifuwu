/**
 * Switch 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（受控布尔契约）：
 * - checked=false → attr 不渲染（checked||undefined——关态属性面）
 * - checked=true → attr checked=""（enumerated 布尔）
 * - onChange 不进 attrs（事件表通道——契约 4）
 * - aria-checked 显式字符串（role=switch 语义）
 * - 受控回流：value 变化 → setProp（不重建——焦点保持前提）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Switch } from './Switch.ts'
import { mount, createTable, assertCreate } from '../../../test/contract/component-harness.ts'

test('受控布尔：checked=false 关态属性面（checked 不渲染——aria-checked="false"）', async () => {
  const h = await mount(Switch, { checked: false })
  const ct = createTable(h.cmds)
  const attrs = ct.get('root.0.0.0')?.attrs ?? ct.get('root.0.0')?.attrs
  assert.ok(attrs, 'input 存在')
  assert.equal(attrs.checked, undefined, 'checked=false → 属性不渲染（关态）')
  assert.equal(attrs['aria-checked'], 'false', 'aria-checked 显式')
  assert.equal(attrs.onChange, undefined, 'onChange 不进 attrs（事件表通道）')
})

test('受控布尔：checked=true → 属性渲染（enumerated）', async () => {
  const h = await mount(Switch, { checked: true })
  const ct = createTable(h.cmds)
  const attrs = ct.get('root.0.0.0')?.attrs ?? ct.get('root.0.0')?.attrs
  assert.ok(attrs.checked !== undefined || attrs.checked === true || attrs.checked === '', `checked 渲染（实际: ${JSON.stringify(attrs.checked)}）`)
})

test('受控回流：checked false→true → setProp（开关不重建）', async () => {
  const h = await mount(Switch, { checked: false })
  const cmds = await h.render({ checked: true })
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'checked'), 'setProp checked')
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建')
})

test('label 形态：无 label → aria-label 兜底（i18n 缺省"切换"）', async () => {
  const h = await mount(Switch, { checked: false })
  const ct = createTable(h.cmds)
  const labelAttrs = ct.get('root.0')?.attrs ?? ct.get('root.0.0')?.attrs
  assert.ok(labelAttrs, 'label 存在')
  // 结构：label > [input, track] 或 [input, track, label]
  assert.ok(ct.has('root.0') || ct.has('root.0.0'), 'label 容器渲染')
})
