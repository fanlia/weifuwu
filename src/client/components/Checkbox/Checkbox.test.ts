import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Checkbox } from './Checkbox.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Checkbox', () => {
  it('renders a checkbox input', async () => {
    const vnode = await renderVNode(Checkbox, {}, createTestCtx())!
    assert.equal(vnode.type, 'label')
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'checkbox')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Checkbox, { label: '同意' }, createTestCtx())!
    const labelEl = vnode.props.children[2]
    assert.equal(labelEl.props.children, '同意')
  })

  it('sets checked state', async () => {
    const vnode = await renderVNode(Checkbox, { checked: true }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.checked, true)
  })

  it('sets disabled state', async () => {
    const vnode = await renderVNode(Checkbox, { disabled: true }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.disabled, true)
  })
})

it('受控 checked + onChange 回调（勾选传反值）', async () => {
  let got: boolean | undefined
  const vnode = await renderVNode(Checkbox, { label: 'x', checked: false, onChange: (v: boolean) => { got = v } }, createTestCtx())!
  const input = vnode.props.children[0]
  input.props.onChange({ target: { checked: true } })
  assert.equal(got, true)
})

it('disabled 传递到原生 input', async () => {
  const vnode = await renderVNode(Checkbox, { label: 'x', disabled: true }, createTestCtx())!
  assert.equal(vnode.props.children[0].props.disabled, true)
})

it('无 onChange/label 也可渲染（边界）', async () => {
  const vnode = await renderVNode(Checkbox, {}, createTestCtx())!
  assert.equal(vnode.props.children[0].props.type, 'checkbox')
})

it('checked=true 传递到 input checked', async () => {
  const vnode = await renderVNode(Checkbox, { label: 'x', checked: true }, createTestCtx())!
  assert.ok(vnode.props.children[0].props.checked)
})

it('非受控：原生点击切换 checked，onChange 携带勾选值', async () => {
  let got: boolean | undefined
  const vnode = await renderVNode(Checkbox, { label: '同意', onChange: (v: boolean) => { got = v } }, createTestCtx())!
  const input = vnode.props.children[0]
  assert.equal(input.props.checked, undefined, '非受控不传 checked')
  input.props.onChange({ target: { checked: true } })
  assert.equal(got, true, 'onChange 携带勾选值')
})

it('受控缺回调：点击不静默（onChange undefined 不报错）', async () => {
  const vnode = await renderVNode(Checkbox, { checked: true, label: 'x' }, createTestCtx())!
  const input = vnode.props.children[0]
  assert.doesNotThrow(() => input.props.onChange?.({ target: { checked: false } }))
})
