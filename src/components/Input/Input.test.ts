import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Input } from './Input.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

describe('Input', () => {
  it('renders an input element', () => {
    // without label/error/hint, renders bare input
    const vnode = renderVNode(Input, {}, mockCtx())!
    assert.equal(vnode.type, 'input')
    assert.equal(vnode.props.type, 'text')
  })

  it('renders label when provided', () => {
    const vnode = renderVNode(Input, { label: '邮箱' }, mockCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    assert.ok(label, 'should have a label element')
    assert.equal(label.props.children, '邮箱')
  })

  it('shows required marker', () => {
    const vnode = renderVNode(Input, { label: '邮箱', required: true }, mockCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    const marker = Array.isArray(label.props.children)
      ? label.props.children.find((c: any) => c?.props?.class === 'wf-input-req')
      : null
    assert.ok(marker, 'should have required marker')
  })

  it('shows error message', () => {
    const vnode = renderVNode(Input, { error: '必填' }, mockCtx())!
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-err')
    assert.ok(err, 'should have error element')
    assert.equal(err.props.children, '必填')
  })

  it('shows hint text', () => {
    const vnode = renderVNode(Input, { hint: '请输入邮箱' }, mockCtx())!
    const hint = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-hint')
    assert.ok(hint, 'should have hint element')
    assert.equal(hint.props.children, '请输入邮箱')
  })

  it('hides hint when error is present', () => {
    const vnode = renderVNode(Input, { hint: '提示', error: '错误' }, mockCtx())!
    const hint = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-hint')
    assert.ok(!hint, 'should not have hint when error is present')
  })

  it('sets input type', () => {
    const vnode = renderVNode(Input, { type: 'email' }, mockCtx())!
    // without label/error/hint, vnode is bare input
    assert.equal(vnode.type, 'input')
    assert.equal(vnode.props.type, 'email')
  })

  it('applies borderless variant class', () => {
    const vnode = renderVNode(Input, { variant: 'borderless' }, mockCtx())!
    assert.match(vnode.props.class, /wf-input--borderless/)
    const plain = renderVNode(Input, {}, mockCtx())!
    assert.doesNotMatch(plain.props.class, /--borderless/)
  })
})
