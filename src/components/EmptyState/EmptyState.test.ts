import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EmptyState } from './EmptyState.ts'
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

describe('EmptyState', () => {
  it('renders container', () => {
    const vnode = renderVNode(EmptyState, {}, mockCtx())!
    assert.match(vnode.props.class, /wf-empty/)
  })

  it('renders default icon and text', () => {
    const vnode = renderVNode(EmptyState, {}, mockCtx())!
    const icon = vnode.props.children[0]
    const text = vnode.props.children[1]
    assert.equal(icon.props.children, '📦')
    assert.equal(text.props.children, '暂无数据')
  })

  it('renders custom icon and text', () => {
    const vnode = renderVNode(EmptyState, { icon: '👤', text: '没有用户' }, mockCtx())!
    const icon = vnode.props.children[0]
    const text = vnode.props.children[1]
    assert.equal(icon.props.children, '👤')
    assert.equal(text.props.children, '没有用户')
  })

  it('renders hint when provided', () => {
    const vnode = renderVNode(EmptyState, { hint: '创建一个新用户' }, mockCtx())!
    const hint = vnode.props.children[2]
    assert.equal(hint.props.class, 'wf-empty-hint')
    assert.equal(hint.props.children, '创建一个新用户')
  })

  it('renders action children', () => {
    const action = '按钮'
    const vnode = renderVNode(EmptyState, { children: action }, mockCtx())!
    const actionEl = vnode.props.children[vnode.props.children.length - 1]
    assert.equal(actionEl.props.class, 'wf-empty-action')
  })
})
