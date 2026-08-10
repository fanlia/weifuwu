import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Avatar } from './Avatar.ts'
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

describe('Avatar', () => {
  it('renders initial when no src', () => {
    const vnode = renderVNode(Avatar, { name: '张三' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.equal(vnode.props.children, '张')
  })

  it('renders fallback for empty name', () => {
    const vnode = renderVNode(Avatar, {}, mockCtx())!
    assert.equal(vnode.props.children, '?')
  })

  it('renders img when src provided', () => {
    const vnode = renderVNode(Avatar, { name: '张三', src: '/photo.jpg' }, mockCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
    assert.equal(vnode.props.alt, '张三')
  })

  it('applies size classes', () => {
    const sm = renderVNode(Avatar, { name: 'A', size: 'sm' }, mockCtx())!
    const lg = renderVNode(Avatar, { name: 'B', size: 'lg' }, mockCtx())!
    assert.match(sm.props.class, /wf-avatar--sm/)
    assert.match(lg.props.class, /wf-avatar--lg/)
  })

  it('color prop overrides hashed background', () => {
    const vnode = renderVNode(Avatar, { name: '张三', color: '#4f6ef7' }, mockCtx())!
    assert.equal(vnode.props.style.background, '#4f6ef7')
  })
})

  it('renders img with src', () => {
    const vnode = renderVNode(Avatar, { name: '张三', src: '/photo.jpg' }, mockCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
  })

  it('renders uppercase initial', () => {
    const vnode = renderVNode(Avatar, { name: 'alice' }, mockCtx())!
    assert.equal(vnode.props.children, 'A')
  })
