import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Switch } from './Switch.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Switch', () => {
  it('renders a switch input', () => {
    const vnode = renderVNode(Switch, {}, mockCtx())!
    assert.equal(vnode.type, 'label')
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'checkbox')
  })

  it('renders label when provided', () => {
    const vnode = renderVNode(Switch, { label: '启用' }, mockCtx())!
    const labelEl = vnode.props.children[2]
    assert.equal(labelEl.props.children, '启用')
  })

  it('sets checked state', () => {
    const vnode = renderVNode(Switch, { checked: true }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.checked, true)
  })

  it('sets disabled state', () => {
    const vnode = renderVNode(Switch, { disabled: true }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.disabled, true)
  })
})

  it('calls onChange when clicked', () => {
    let val = false
    const vnode = renderVNode(Switch, { onChange: (v: boolean) => { val = v } }, mockCtx())!
    const input = vnode.props.children[0]
    input.props.onChange({ target: { checked: true } } as any)
    assert.equal(val, true)
  })

  it('has aria-checked attribute', () => {
    const vnode = renderVNode(Switch, { checked: true }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props['aria-checked'], 'true')
  })
