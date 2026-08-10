import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Switch } from './Switch.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

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

it('role=switch + aria-checked 同步 checked（无障碍）', () => {
  const vnode = renderVNode(Switch, { checked: true }, mockCtx())!
  const input = vnode.props.children[0]
  assert.equal(input.props.role, 'switch')
  assert.equal(input.props['aria-checked'], 'true')
})

it('onChange 携带勾选值（事件 target.checked）', () => {
  let got: boolean | undefined
  const vnode = renderVNode(Switch, { checked: false, onChange: (v: boolean) => { got = v } }, mockCtx())!
  vnode.props.children[0].props.onChange({ target: { checked: true } })
  assert.equal(got, true)
})
