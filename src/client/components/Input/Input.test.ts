/**
 * Input 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定：
 * - value 空串也渲染（attr value=""——property 通道契约——text 是 children）
 * - 事件函数不进 attrs（onInput/onChange 经事件表通道——契约 4）
 * - 无 label/error/hint = 单根输出（input 直接返回）；含 label = 包装形态
 * - error/hint 互斥（hint 仅 !error）
 *
 * 运行：node --env-file=.env --test src/client/components/Input/Input.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Input } from './Input.ts'
import { mount, createTable, assertCreate } from '../../../test/contract/component-harness.ts'

test('单根形态（无 label/error/hint）：input 直接输出——attrs 事件函数过滤', async () => {
  const h = await mount(Input, { name: 'username', placeholder: '输入', value: '' })
  const ct = createTable(h.cmds)
  assertCreate(ct, 'root.0', 'input', { name: 'username', placeholder: '输入', value: '' })
  const attrs = ct.get('root.0')!.attrs
  assert.equal(attrs.onInput, undefined, 'onInput 不进 attrs（事件表）')
  assert.equal(attrs.onChange, undefined, 'onChange 不进 attrs（事件表）')
  assert.equal(attrs.value, '', 'value 空串渲染（property 通道——不是 hole）')
})

test('包装形态（label/error/hint）：label + input + 状态条', async () => {
  const h = await mount(Input, { label: '姓名', required: true, value: 'x', error: 'err' })
  const ct = createTable(h.cmds)
  assertCreate(ct, 'root.0.0', 'label', { class: 'wf-input-label' })
  assertCreate(ct, 'root.0.1', 'input', { value: 'x' })
  assertCreate(ct, 'root.0.2', 'div', { class: 'wf-input-err' })
  // hint 不渲染（error 互斥）
  assert.equal(ct.has('root.0.3'), false, 'hint 与 error 互斥')
})

test('error → 移除（条件渲染 diff——无重建）', async () => {
  const h = await mount(Input, { label: 'a', value: 'x', error: 'err' })
  const cmds = await h.render({ label: 'a', value: 'x' })
  assert.ok(cmds.some((c) => c.op === 'remove'), 'error 移除（条件回退）')
  assert.ok(!cmds.some((c) => c.op === 'create'), '纯移除——无重建')
})

test('value 变化 → setProp（受控回流——input 不重建——焦点保持前提）', async () => {
  const h = await mount(Input, { name: 'n', value: 'a' })
  const cmds = await h.render({ name: 'n', value: 'b' })
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'value' && (c as any).value === 'b'), 'setProp value=b')
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建')
})
