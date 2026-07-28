import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Textarea } from './Textarea.ts'
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

function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

describe('Textarea', () => {
  it('renders a textarea element', () => {
    const vnode = renderVNode(Textarea, {}, mockCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.ok(ta, 'should have a textarea element')
  })

  it('renders label when provided', () => {
    const vnode = renderVNode(Textarea, { label: '简介' }, mockCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    assert.ok(label, 'should have a label element')
    assert.equal(label.props.children, '简介')
  })

  it('sets default rows to 3', () => {
    const vnode = renderVNode(Textarea, {}, mockCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.rows, 3)
  })

  it('accepts custom rows', () => {
    const vnode = renderVNode(Textarea, { rows: 6 }, mockCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.rows, 6)
  })

  it('shows error message', () => {
    const vnode = renderVNode(Textarea, { error: '必填' }, mockCtx())!
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-textarea-err')
    assert.ok(err, 'should have error element')
    assert.equal(err.props.children, '必填')
  })
})
