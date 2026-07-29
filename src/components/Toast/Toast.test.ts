import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Toast } from './Toast.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Toast', () => {
  it('returns null when no toasts', () => {
    const result = renderVNode(Toast, { toasts: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('renders toast items', () => {
    const toasts = [
      { id: '1', type: 'success' as const, message: '操作成功' },
      { id: '2', type: 'error' as const, message: '网络错误' },
    ]
    const vnode = inner(renderVNode(Toast, { toasts }, mockCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-toast-container/)
    const items = vnode.props.children
    assert.equal(items.length, 2)
    assert.match(items[0].props.class, /wf-toast--success/)
    assert.match(items[1].props.class, /wf-toast--error/)
  })

  it('renders message text', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示信息' }]
    const vnode = inner(renderVNode(Toast, { toasts }, mockCtx())!)
    const msg = vnode.props.children[0].props.children[1]
    assert.equal(msg.props.children, '提示信息')
  })

  it('calls onRemove on click', () => {
    let removed = ''
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = inner(renderVNode(Toast, { toasts, onRemove: (id: string) => { removed = id } }, mockCtx())!)
    const item = vnode.props.children[0]
    item.props.onClick()
    assert.equal(removed, '1')
  })

  it('renders with position class', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = inner(renderVNode(Toast, { toasts, position: 'bottom-left' }, mockCtx())!)
    assert.match(vnode.props.class, /wf-toast--bl/)
  })

  it('defaults to top-right position', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = inner(renderVNode(Toast, { toasts }, mockCtx())!)
    assert.match(vnode.props.class, /wf-toast--tr/)
  })

  it('limits visible toasts by max', () => {
    const toasts = [
      { id: '1', type: 'info' as const, message: '1' },
      { id: '2', type: 'info' as const, message: '2' },
      { id: '3', type: 'info' as const, message: '3' },
    ]
    const vnode = inner(renderVNode(Toast, { toasts, max: 2 }, mockCtx())!)
    const items = vnode.props.children
    assert.equal(items.length, 2)
    // 保留最新的 2 条
    assert.equal(items[0].props.children[1].props.children, '2')
    assert.equal(items[1].props.children[1].props.children, '3')
  })

  it('sets data-duration attribute when duration provided', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = inner(renderVNode(Toast, { toasts, duration: 3000 }, mockCtx())!)
    const item = vnode.props.children[0]
    assert.equal(item.props['data-duration'], 3000)
  })

  it('allows per-item duration override', () => {
    const toasts = [
      { id: '1', type: 'info' as const, message: '短', duration: 1000 },
      { id: '2', type: 'info' as const, message: '长' },
    ]
    const vnode = inner(renderVNode(Toast, { toasts, duration: 5000 }, mockCtx())!)
    const items = vnode.props.children
    assert.equal(items[0].props['data-duration'], 1000)
    assert.equal(items[1].props['data-duration'], 5000)
  })
})
