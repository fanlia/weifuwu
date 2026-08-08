import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AspectRatio } from './AspectRatio.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('AspectRatio', () => {
  it('renders container with default 16/9 ratio', () => {
    const vnode = renderVNode(AspectRatio, { children: 'x' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-aspect-ratio/)
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '16 / 9')
  })

  it('accepts custom ratio', () => {
    const vnode = renderVNode(AspectRatio, { ratio: 4 / 3, children: 'x' }, mockCtx())!
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '1.3333333333333333')
  })

  it('passes children through', () => {
    const vnode = renderVNode(AspectRatio, { ratio: 1, children: '内容' }, mockCtx())!
    assert.equal(vnode.props.children, '内容')
  })

  it('merges className', () => {
    const vnode = renderVNode(AspectRatio, { className: 'thumb', children: 'x' }, mockCtx())!
    assert.match(vnode.props.class, /thumb/)
  })
})
