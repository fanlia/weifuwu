import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Alert } from './Alert.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Alert', () => {
  it('renders message', () => {
    const vnode = Alert({ children: '操作成功' }, mockCtx())!
    assert.match(vnode.props.class, /wf-alert/)
    const msg = vnode.props.children[1]
    assert.equal(msg.props.children, '操作成功')
  })

  it('returns null when no children', () => {
    const result = Alert({}, mockCtx())
    assert.equal(result, null)
  })

  it('renders all variants', () => {
    for (const v of ['info', 'success', 'warning', 'error'] as const) {
      const vnode = Alert({ variant: v, children: '消息' }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-alert--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = Alert({ closable: true, children: '消息' }, mockCtx())!
    const closeBtn = vnode.props.children[2]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-alert-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = Alert({ closable: true, onClose: () => { closed = true }, children: '消息' }, mockCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(closed, true)
  })
})
