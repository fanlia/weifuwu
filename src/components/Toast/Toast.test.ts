import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Toast } from './Toast.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Toast', () => {
  it('returns null when no toasts', () => {
    const result = Toast({ toasts: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('renders toast items', () => {
    const toasts = [
      { id: '1', type: 'success' as const, message: '操作成功' },
      { id: '2', type: 'error' as const, message: '网络错误' },
    ]
    const vnode = Toast({ toasts }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-toast-container/)
    const items = vnode.props.children
    assert.equal(items.length, 2)
    assert.match(items[0].props.class, /wf-toast--success/)
    assert.match(items[1].props.class, /wf-toast--error/)
  })

  it('renders message text', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: '提示信息' }]
    const vnode = Toast({ toasts }, mockCtx())!
    const msg = vnode.props.children[0].props.children[1]
    assert.equal(msg.props.children, '提示信息')
  })

  it('calls onRemove on click', () => {
    let removed = ''
    const toasts = [{ id: '1', type: 'info' as const, message: '提示' }]
    const vnode = Toast({ toasts, onRemove: (id: string) => { removed = id } }, mockCtx())!
    const item = vnode.props.children[0]
    item.props.onClick()
    assert.equal(removed, '1')
  })
})
