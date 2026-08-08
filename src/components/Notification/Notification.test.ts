import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Notification, notification } from './Notification.ts'
import { Portal } from '../../client/vnode.ts'
import { createReactiveState } from '../../client/reactive.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Notification', () => {
  it('returns null when no items', () => {
    const result = renderVNode(Notification, { items: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('renders items with title and description', () => {
    const items = [
      { id: '1', type: 'success' as const, title: '部署成功', description: 'v0.62.0 已上线' },
    ]
    const vnode = inner(renderVNode(Notification, { items }, mockCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-notification-container/)
    const item = vnode.props.children[0]
    assert.match(item.props.class, /wf-notification/)
    const body = item.props.children[1] // [icon, body, close]
    assert.equal(body.props.children[0].props.class, 'wf-notification-title')
    assert.equal(body.props.children[0].props.children, '部署成功')
    assert.equal(body.props.children[1].props.children, 'v0.62.0 已上线')
  })

  it('renders type icon', () => {
    const items = [{ id: '1', type: 'warning' as const, title: '注意' }]
    const vnode = inner(renderVNode(Notification, { items }, mockCtx())!)
    const icon = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-icon')
    assert.equal(icon.props.children.props.name, 'alert')
  })

  it('calls onRemove when close button clicked', () => {
    let removed: string | null = null
    const items = [{ id: 'x', type: 'info' as const, title: '提示' }]
    const vnode = inner(renderVNode(Notification, { items, onRemove: (id: string) => { removed = id } }, mockCtx())!)
    const close = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-close')
    close.props.onClick()
    assert.equal(removed, 'x')
  })

  it('renders position class', () => {
    const items = [{ id: '1', type: 'info' as const, title: 't' }]
    const vnode = inner(renderVNode(Notification, { items, position: 'bottom-left' }, mockCtx())!)
    assert.match(vnode.props.class, /wf-notification--bl/)
  })

  it('limits items by max', () => {
    const items = [
      { id: '1', type: 'info' as const, title: 'a' },
      { id: '2', type: 'info' as const, title: 'b' },
      { id: '3', type: 'info' as const, title: 'c' },
    ]
    const vnode = inner(renderVNode(Notification, { items, max: 2 }, mockCtx())!)
    assert.equal(vnode.props.children.length, 2)
    assert.equal(vnode.props.children[0].props['data-id'], '2') // 保留最新
  })

  it('renders action button', () => {
    let clicked = false
    const items = [{ id: '1', type: 'info' as const, title: 't', action: { label: '查看', onClick: () => { clicked = true } } }]
    const vnode = inner(renderVNode(Notification, { items }, mockCtx())!)
    const body = vnode.props.children[0].props.children[1]
    const action = body.props.children.find((c: any) => c.props?.class === 'wf-notification-action')
    assert.equal(action.props.children, '查看')
    action.props.onClick({ stopPropagation: () => {} })
    assert.equal(clicked, true)
  })
})

describe('notification 命令式中间件', () => {
  it('injects ctx.notification with open/success/error/info/warning', () => {
    const ctx = mockCtx() as any
    const middleware = notification({ duration: 0 }) as any
    const injected = middleware(ctx)
    assert.equal(typeof injected.notification, 'function')
    assert.equal(typeof injected.notification.success, 'function')
    assert.equal(typeof injected.notification.error, 'function')
    assert.equal(typeof injected.notification.info, 'function')
    assert.equal(typeof injected.notification.warning, 'function')
  })

  it('notification.success mounts host and triggers reactive update', () => {
    document.body.innerHTML = ''
    let dirtyCount = 0
    const state = createReactiveState(() => { dirtyCount++ })
    const ctx = mockCtx() as any
    ctx.ui.$ = () => state
    const middleware = notification({ duration: 0, max: 10 }) as any
    middleware(ctx)
    ctx.notification.success({ title: '保存成功', description: '已写入数据库' }) // 首次 emit → 惰性挂载 host
    const host = document.querySelector('.wf-notification-host')
    assert.ok(host, '应挂载 NotificationHost')
    assert.ok(dirtyCount > 0, '$ 赋值应触发 dirty（渲染链路通）')
  })

  it('notification.open with type', () => {
    document.body.innerHTML = ''
    let dirtyCount = 0
    const state = createReactiveState(() => { dirtyCount++ })
    const ctx = mockCtx() as any
    ctx.ui.$ = () => state
    const middleware = notification({ duration: 0 }) as any
    middleware(ctx)
    ctx.notification.open({ type: 'error', title: '请求失败', description: '500' })
    assert.ok(dirtyCount > 0)
  })
})
