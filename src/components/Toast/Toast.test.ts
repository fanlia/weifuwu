import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Toast } from './Toast.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'


function createTestCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Toast', () => {
  it('returns null when no toasts', async () => {
    const result = await renderVNode(Toast, { toasts: [] }, createTestCtx())
    assert.equal(result, null)
  })

  it('renders toast items', async () => {
    const toasts = [
      { id: '1', type: 'success' as const, message: '操作成功' },
      { id: '2', type: 'error' as const, message: '网络错误' },
    ]
    const vnode = await inner(await renderVNode(Toast, { toasts }, createTestCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-toast-container/)
    const items = vnode.props.children
    assert.equal(items.length, 2)
    assert.match(items[0].props.class, /wf-toast--success/)
    assert.match(items[1].props.class, /wf-toast--error/)
  })

  it('renders message text', async () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示信息' }]
    const vnode = await inner(await renderVNode(Toast, { toasts }, createTestCtx())!)
    const msg = vnode.props.children[0].props.children[1]
    assert.equal(msg.props.children, '提示信息')
  })

  it('calls onRemove on click', async () => {
    let removed = ''
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = await inner(await renderVNode(Toast, { toasts, onRemove: (id: string) => { removed = id } }, createTestCtx())!)
    const item = vnode.props.children[0]
    item.props.onClick()
    assert.equal(removed, '1')
  })

  it('renders with position class', async () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = await inner(await renderVNode(Toast, { toasts, position: 'bottom-left' }, createTestCtx())!)
    assert.match(vnode.props.class, /wf-toast--bl/)
  })

  it('defaults to top-right position', async () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = await inner(await renderVNode(Toast, { toasts }, createTestCtx())!)
    assert.match(vnode.props.class, /wf-toast--tr/)
  })

  it('limits visible toasts by max', async () => {
    const toasts = [
      { id: '1', type: 'info' as const, message: '1' },
      { id: '2', type: 'info' as const, message: '2' },
      { id: '3', type: 'info' as const, message: '3' },
    ]
    const vnode = await inner(await renderVNode(Toast, { toasts, max: 2 }, createTestCtx())!)
    const items = vnode.props.children
    assert.equal(items.length, 2)
    // 保留最新的 2 条
    assert.equal(items[0].props.children[1].props.children, '2')
    assert.equal(items[1].props.children[1].props.children, '3')
  })

  it('sets data-duration attribute when duration provided', async () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = await inner(await renderVNode(Toast, { toasts, duration: 3000 }, createTestCtx())!)
    const item = vnode.props.children[0]
    assert.equal(item.props['data-duration'], 3000)
  })

  it('allows per-item duration override', async () => {
    const toasts = [
      { id: '1', type: 'info' as const, message: '短', duration: 1000 },
      { id: '2', type: 'info' as const, message: '长' },
    ]
    const vnode = await inner(await renderVNode(Toast, { toasts, duration: 5000 }, createTestCtx())!)
    const items = vnode.props.children
    assert.equal(items[0].props['data-duration'], 1000)
    assert.equal(items[1].props['data-duration'], 5000)
  })
})
