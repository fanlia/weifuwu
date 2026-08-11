import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Alert } from './Alert.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Alert', () => {
  it('renders message', () => {
    const vnode = renderVNode(Alert, { children: '操作成功' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-alert/)
    const msg = vnode.props.children[1]
    assert.equal(msg.props.children, '操作成功')
  })

  it('returns null when no children', () => {
    const result = renderVNode(Alert, {}, createTestCtx())
    assert.equal(result, null)
  })

  it('renders all variants', () => {
    for (const v of ['info', 'success', 'warning', 'error'] as const) {
      const vnode = renderVNode(Alert, { variant: v, children: '消息' }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-alert--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = renderVNode(Alert, { closable: true, children: '消息' }, createTestCtx())!
    const closeBtn = vnode.props.children[2]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-alert-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = renderVNode(Alert, { closable: true, onClose: () => { closed = true }, children: '消息' }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(closed, true)
  })
})

it('closable + onClose：关闭按钮点击回调', () => {
  let closed = 0
  const vnode = renderVNode(Alert, { closable: true, onClose: () => closed++, children: 'x' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('close'), '关闭按钮存在')
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.onClick && /close/.test(String(n.props?.class ?? ''))) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  find(vnode).props.onClick()
  assert.equal(closed, 1)
})

it('variant 着色类（success/error）', () => {
  const v1 = renderVNode(Alert, { variant: 'success', children: 'x' }, createTestCtx())!
  assert.ok(JSON.stringify(v1).includes('success'))
  const v2 = renderVNode(Alert, { variant: 'error', children: 'x' }, createTestCtx())!
  assert.ok(JSON.stringify(v2).includes('error'))
})

it('非 closable 无关闭按钮（边界）', () => {
  const vnode = renderVNode(Alert, { children: 'x' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(!/wf-alert-close/.test(s))
})
