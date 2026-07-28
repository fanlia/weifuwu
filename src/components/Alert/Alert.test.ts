import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Alert } from './Alert.ts'
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

describe('Alert', () => {
  it('renders message', () => {
    const vnode = renderVNode(Alert, { children: '操作成功' }, mockCtx())!
    assert.match(vnode.props.class, /wf-alert/)
    const msg = vnode.props.children[1]
    assert.equal(msg.props.children, '操作成功')
  })

  it('returns null when no children', () => {
    const result = renderVNode(Alert, {}, mockCtx())
    assert.equal(result, null)
  })

  it('renders all variants', () => {
    for (const v of ['info', 'success', 'warning', 'error'] as const) {
      const vnode = renderVNode(Alert, { variant: v, children: '消息' }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-alert--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = renderVNode(Alert, { closable: true, children: '消息' }, mockCtx())!
    const closeBtn = vnode.props.children[2]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-alert-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = renderVNode(Alert, { closable: true, onClose: () => { closed = true }, children: '消息' }, mockCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(closed, true)
  })
})
