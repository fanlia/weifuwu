import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Form } from './Form.ts'
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

describe('Form', () => {
  it('renders a form element', () => {
    const vnode = renderVNode(Form, { children: '内容' }, mockCtx())!
    assert.equal(vnode.type, 'form')
    assert.match(vnode.props.class, /wf-form/)
  })

  it('renders children', () => {
    const vnode = renderVNode(Form, { children: '表单字段' }, mockCtx())!
    assert.equal(vnode.props.children, '表单字段')
  })

  it('calls preventDefault on submit', () => {
    let prevented = false
    const vnode = renderVNode(Form, { onSubmit: () => {} }, mockCtx())!
    const fakeEvent = { preventDefault: () => { prevented = true } } as any
    vnode.props.onSubmit(fakeEvent)
    assert.equal(prevented, true)
  })

  it('calls onSubmit when form is submitted', () => {
    let called = false
    const vnode = renderVNode(Form, { onSubmit: () => { called = true } }, mockCtx())!
    const fakeEvent = { preventDefault: () => {} } as any
    vnode.props.onSubmit(fakeEvent)
    assert.equal(called, true)
  })
})
