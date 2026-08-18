import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Switch } from './Switch.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Switch', () => {
  it('renders a switch input', async () => {
    const vnode = await renderVNode(Switch, {}, createTestCtx())!
    assert.equal(vnode.type, 'label')
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'checkbox')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Switch, { label: '启用' }, createTestCtx())!
    const labelEl = vnode.props.children[2]
    assert.equal(labelEl.props.children, '启用')
  })

  it('sets checked state', async () => {
    const vnode = await renderVNode(Switch, { checked: true }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.checked, true)
  })

  it('sets disabled state', async () => {
    const vnode = await renderVNode(Switch, { disabled: true }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.disabled, true)
  })
})

  it('calls onChange when clicked', async () => {
    let val = false
    const vnode = await renderVNode(Switch, { onChange: (v: boolean) => { val = v } }, createTestCtx())!
    const input = vnode.props.children[0]
    input.props.onChange({ target: { checked: true } } as any)
    assert.equal(val, true)
  })

  it('has aria-checked attribute', async () => {
    const vnode = await renderVNode(Switch, { checked: true }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props['aria-checked'], 'true')
  })

it('role=switch + aria-checked 同步 checked（无障碍）', async () => {
  const vnode = await renderVNode(Switch, { checked: true }, createTestCtx())!
  const input = vnode.props.children[0]
  assert.equal(input.props.role, 'switch')
  assert.equal(input.props['aria-checked'], 'true')
})

it('onChange 携带勾选值（事件 target.checked）', async () => {
  let got: boolean | undefined
  const vnode = await renderVNode(Switch, { checked: false, onChange: (v: boolean) => { got = v } }, createTestCtx())!
  vnode.props.children[0].props.onChange({ target: { checked: true } })
  assert.equal(got, true)
})
