import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EmptyState } from './EmptyState.ts'
import { Icon } from '../Icon/Icon.ts'
import { h } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('EmptyState', () => {
  it('renders container', async () => {
    const vnode = await renderVNode(EmptyState, {}, createTestCtx())!
    assert.match(vnode.props.class, /wf-empty/)
  })

  it('renders default icon and text', async () => {
    const vnode = await renderVNode(EmptyState, {}, createTestCtx())!
    const icon = vnode.props.children[0]
    const text = vnode.props.children[1]
    // 默认图标 = Icon 组件（P3：组件内禁裸 emoji——inbox 空态语义）
    assert.equal(icon.props.children.type, Icon)
    assert.equal(icon.props.children.props.name, 'inbox')
    assert.equal(text.props.children, '暂无数据')
  })

  it('renders custom icon and text', async () => {
    const vnode = await renderVNode(EmptyState, { icon: h(Icon, { name: 'user' }), text: '没有用户' }, createTestCtx())!
    const icon = vnode.props.children[0]
    const text = vnode.props.children[1]
    assert.equal(icon.props.children.props.name, 'user')
    assert.equal(text.props.children, '没有用户')
  })

  it('renders hint when provided', async () => {
    const vnode = await renderVNode(EmptyState, { hint: '创建一个新用户' }, createTestCtx())!
    const hint = vnode.props.children[2]
    assert.equal(hint.props.class, 'wf-empty-hint')
    assert.equal(hint.props.children, '创建一个新用户')
  })

  it('renders action children', async () => {
    const action = '按钮'
    const vnode = await renderVNode(EmptyState, { children: action }, createTestCtx())!
    const actionEl = vnode.props.children[vnode.props.children.length - 1]
    assert.equal(actionEl.props.class, 'wf-empty-action')
  })
})
