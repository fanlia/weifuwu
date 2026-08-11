import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AspectRatio } from './AspectRatio.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('AspectRatio', () => {
  it('renders container with default 16/9 ratio', () => {
    const vnode = renderVNode(AspectRatio, { children: 'x' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-aspect-ratio/)
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '16 / 9')
  })

  it('accepts custom ratio', () => {
    const vnode = renderVNode(AspectRatio, { ratio: 4 / 3, children: 'x' }, createTestCtx())!
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '1.3333333333333333')
  })

  it('passes children through', () => {
    const vnode = renderVNode(AspectRatio, { ratio: 1, children: '内容' }, createTestCtx())!
    assert.equal(vnode.props.children, '内容')
  })

  it('merges className', () => {
    const vnode = renderVNode(AspectRatio, { className: 'thumb', children: 'x' }, createTestCtx())!
    assert.match(vnode.props.class, /thumb/)
  })
})
