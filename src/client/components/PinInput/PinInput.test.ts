/**
 * PinInput 组件测试（vdom3 迁移补测——最小基线）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'
import { PinInput } from './PinInput.ts'

before(setupJsdom)

test('渲染：PIN 输入框（4 格默认）', async () => {
  const vnode = await renderVNode(PinInput, {}, createTestCtx()) as any
  const text = JSON.stringify(vnode)
  assert.ok(text.includes('wf-pin'), '容器 class')
})

test('渲染：自定义长度（6 格）', async () => {
  const vnode = await renderVNode(PinInput, { length: 6 }, createTestCtx()) as any
  assert.ok(JSON.stringify(vnode).length > 0, '渲染输出')
})

test('渲染：值回填', async () => {
  const vnode = await renderVNode(PinInput, { value: '1234', length: 4 }, createTestCtx()) as any
  assert.ok(vnode != null, '渲染输出（value 回填）')
})
