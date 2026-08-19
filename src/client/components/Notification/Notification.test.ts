import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Notification } from './Notification.ts'
import { Portal } from '../../vdom/core/node/portal.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'


function makeCtx(): UIContext {
  return { ui: {
    $: () => ({}), render: () => {}, dirty: () => {}, ready: true, useExternal: () => undefined,
    usePopup: () => ({ get open() { return true }, setOpen: () => {}, wrapProps: {}, portal: (c: any) => c, refresh: () => {} }),
  } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Notification', () => {
  it('returns null when no items', async () => {
    const result = await renderVNode(Notification, { items: [] }, makeCtx())
    assert.equal(result, null)
  })

  it('renders items with title and description', async () => {
    const items = [
      { id: '1', type: 'success' as const, title: '部署成功', description: 'v0.62.0 已上线' },
    ]
    const vnode = await inner(await renderVNode(Notification, { items }, makeCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-notification-container/)
    const item = vnode.props.children[0]
    assert.match(item.props.class, /wf-notification/)
    const body = item.props.children[1] // [icon, body, close]
    assert.equal(body.props.children[0].props.class, 'wf-notification-title')
    assert.equal(body.props.children[0].props.children, '部署成功')
    assert.equal(body.props.children[1].props.children, 'v0.62.0 已上线')
  })

  it('renders type icon', async () => {
    const items = [{ id: '1', type: 'warning' as const, title: '注意' }]
    const vnode = await inner(await renderVNode(Notification, { items }, makeCtx())!)
    const icon = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-icon')
    assert.equal(icon.props.children.props.name, 'alert')
  })

  it('calls onRemove when close button clicked', async () => {
    let removed: string | null = null
    const items = [{ id: 'x', type: 'info' as const, title: '提示' }]
    const vnode = await inner(await renderVNode(Notification, { items, onRemove: (id: string) => { removed = id } }, makeCtx())!)
    const close = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-close')
    close.props.onClick()
    assert.equal(removed, 'x')
  })

  it('renders position class', async () => {
    const items = [{ id: '1', type: 'info' as const, title: 't' }]
    const vnode = await inner(await renderVNode(Notification, { items, position: 'bottom-left' }, makeCtx())!)
    assert.match(vnode.props.class, /wf-notification--bl/)
  })

  it('limits items by max', async () => {
    const items = [
      { id: '1', type: 'info' as const, title: 'a' },
      { id: '2', type: 'info' as const, title: 'b' },
      { id: '3', type: 'info' as const, title: 'c' },
    ]
    const vnode = await inner(await renderVNode(Notification, { items, max: 2 }, makeCtx())!)
    assert.equal(vnode.props.children.length, 2)
    assert.equal(vnode.props.children[0].props['data-id'], '2') // 保留最新
  })

  it('renders action button', async () => {
    let clicked = false
    const items = [{ id: '1', type: 'info' as const, title: 't', action: { label: '查看', onClick: () => { clicked = true } } }]
    const vnode = await inner(await renderVNode(Notification, { items }, makeCtx())!)
    const body = vnode.props.children[0].props.children[1]
    const action = body.props.children.find((c: any) => c.props?.class === 'wf-notification-action')
    assert.equal(action.props.children, '查看')
    action.props.onClick({ stopPropagation: () => {} })
    assert.equal(clicked, true)
  })
})
