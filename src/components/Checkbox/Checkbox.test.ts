import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Checkbox } from './Checkbox.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    const vnode = renderVNode(Checkbox, {}, mockCtx())!
    assert.equal(vnode.type, 'label')
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'checkbox')
  })

  it('renders label when provided', () => {
    const vnode = renderVNode(Checkbox, { label: '同意' }, mockCtx())!
    const labelEl = vnode.props.children[2]
    assert.equal(labelEl.props.children, '同意')
  })

  it('sets checked state', () => {
    const vnode = renderVNode(Checkbox, { checked: true }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.checked, true)
  })

  it('sets disabled state', () => {
    const vnode = renderVNode(Checkbox, { disabled: true }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.disabled, true)
  })
})

it('受控 checked + onChange 回调（勾选传反值）', () => {
  let got: boolean | undefined
  const vnode = renderVNode(Checkbox, { label: 'x', checked: false, onChange: (v: boolean) => { got = v } }, mockCtx())!
  const input = vnode.props.children[0]
  input.props.onChange({ target: { checked: true } })
  assert.equal(got, true)
})

it('disabled 传递到原生 input', () => {
  const vnode = renderVNode(Checkbox, { label: 'x', disabled: true }, mockCtx())!
  assert.equal(vnode.props.children[0].props.disabled, true)
})

it('无 onChange/label 也可渲染（边界）', () => {
  const vnode = renderVNode(Checkbox, {}, mockCtx())!
  assert.equal(vnode.props.children[0].props.type, 'checkbox')
})

it('checked=true 传递到 input checked', () => {
  const vnode = renderVNode(Checkbox, { label: 'x', checked: true }, mockCtx())!
  assert.ok(vnode.props.children[0].props.checked)
})
