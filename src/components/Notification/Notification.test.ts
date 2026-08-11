import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Notification, notification } from './Notification.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


function makeCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true, useExternal: () => undefined } } as any
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
    const vnode = inner(await renderVNode(Notification, { items }, makeCtx())!)
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
    const vnode = inner(await renderVNode(Notification, { items }, makeCtx())!)
    const icon = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-icon')
    assert.equal(icon.props.children.props.name, 'alert')
  })

  it('calls onRemove when close button clicked', async () => {
    let removed: string | null = null
    const items = [{ id: 'x', type: 'info' as const, title: '提示' }]
    const vnode = inner(await renderVNode(Notification, { items, onRemove: (id: string) => { removed = id } }, makeCtx())!)
    const close = vnode.props.children[0].props.children.find((c: any) => c.props?.class === 'wf-notification-close')
    close.props.onClick()
    assert.equal(removed, 'x')
  })

  it('renders position class', async () => {
    const items = [{ id: '1', type: 'info' as const, title: 't' }]
    const vnode = inner(await renderVNode(Notification, { items, position: 'bottom-left' }, makeCtx())!)
    assert.match(vnode.props.class, /wf-notification--bl/)
  })

  it('limits items by max', async () => {
    const items = [
      { id: '1', type: 'info' as const, title: 'a' },
      { id: '2', type: 'info' as const, title: 'b' },
      { id: '3', type: 'info' as const, title: 'c' },
    ]
    const vnode = inner(await renderVNode(Notification, { items, max: 2 }, makeCtx())!)
    assert.equal(vnode.props.children.length, 2)
    assert.equal(vnode.props.children[0].props['data-id'], '2') // 保留最新
  })

  it('renders action button', async () => {
    let clicked = false
    const items = [{ id: '1', type: 'info' as const, title: 't', action: { label: '查看', onClick: () => { clicked = true } } }]
    const vnode = inner(await renderVNode(Notification, { items }, makeCtx())!)
    const body = vnode.props.children[0].props.children[1]
    const action = body.props.children.find((c: any) => c.props?.class === 'wf-notification-action')
    assert.equal(action.props.children, '查看')
    action.props.onClick({ stopPropagation: () => {} })
    assert.equal(clicked, true)
  })
})

describe('notification 命令式中间件', () => {
  it('injects ctx.notification with open/success/error/info/warning', async () => {
    const ctx = makeCtx() as any
    const middleware = notification({ duration: 0 }) as any
    const injected = middleware(ctx)
    assert.equal(typeof injected.notification, 'function')
    assert.equal(typeof injected.notification.success, 'function')
    assert.equal(typeof injected.notification.error, 'function')
    assert.equal(typeof injected.notification.info, 'function')
    assert.equal(typeof injected.notification.warning, 'function')
  })

  it('notification.success mounts host and triggers reactive update', async () => {
    document.body.innerHTML = ''
    let renderCount = 0
    const ctx = createTestCtx({ ui: { render: () => { renderCount++ } } }) as any
    const middleware = notification({ duration: 0, max: 10 }) as any
    middleware(ctx)
        ctx.notification.success({ title: '保存成功', description: '已写入数据库' }) // 首次 emit → 惰性挂载 host
    await new Promise((r) => setTimeout(r, 0))
    const host = document.querySelector('.wf-notification-host')
    assert.ok(host, '应挂载 NotificationHost')
    ctx.notification.success({ title: '第二次', description: 'host 已就绪' })   // hostApi 已设 → add 走真实渲染链路
    assert.ok(renderCount > 0, 'render 被调用（渲染链路通）')
  })

  it('notification.open with type', async () => {
    document.body.innerHTML = ''
    let renderCount = 0
    const ctx = createTestCtx({ ui: { render: () => { renderCount++ } } }) as any
    const middleware = notification({ duration: 0 }) as any
    middleware(ctx)
    ctx.notification.open({ type: 'error', title: '请求失败', description: '500' })  // 挂载 host
    await new Promise((r) => setTimeout(r, 0))
    ctx.notification.open({ type: 'error', title: '请求失败', description: '500' })  // hostApi 就绪 → render
    assert.ok(renderCount > 0)
  })
})
