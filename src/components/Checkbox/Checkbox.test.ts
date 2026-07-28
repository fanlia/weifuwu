import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Checkbox } from './Checkbox.ts'
import type { WfuiContext } from '../../client/types.ts'

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
