import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Avatar } from './Avatar.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Avatar', () => {
  it('renders initial when no src', () => {
    const vnode = Avatar({ name: '张三' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.equal(vnode.props.children, '张')
  })

  it('renders fallback for empty name', () => {
    const vnode = Avatar({}, mockCtx())!
    assert.equal(vnode.props.children, '?')
  })

  it('renders img when src provided', () => {
    const vnode = Avatar({ name: '张三', src: '/photo.jpg' }, mockCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
    assert.equal(vnode.props.alt, '张三')
  })

  it('applies size classes', () => {
    const sm = Avatar({ name: 'A', size: 'sm' }, mockCtx())!
    const lg = Avatar({ name: 'B', size: 'lg' }, mockCtx())!
    assert.match(sm.props.class, /wf-avatar--sm/)
    assert.match(lg.props.class, /wf-avatar--lg/)
  })
})

  it('renders img with src', () => {
    const vnode = Avatar({ name: '张三', src: '/photo.jpg' }, mockCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
  })

  it('renders uppercase initial', () => {
    const vnode = Avatar({ name: 'alice' }, mockCtx())!
    assert.equal(vnode.props.children, 'A')
  })
