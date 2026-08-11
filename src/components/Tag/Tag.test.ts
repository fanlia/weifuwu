import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tag } from './Tag.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tag', () => {
  it('renders tag text', () => {
    const vnode = renderVNode(Tag, { children: '标签' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-tag/)
    const text = vnode.props.children[0]
    assert.equal(text.props.children, '标签')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'danger'] as const) {
      const vnode = renderVNode(Tag, { variant: v, children: v }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-tag--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = renderVNode(Tag, { closable: true, children: '可关闭' }, createTestCtx())!
    const closeBtn = vnode.props.children[1]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-tag-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = renderVNode(Tag, { closable: true, onClose: () => { closed = true }, children: '标签' }, createTestCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(closed, true)
  })
})

it('closable 关闭按钮点击触发 onClose', () => {
  let closed = 0
  const vnode = renderVNode(Tag, { closable: true, onClose: () => closed++, children: 'x' }, createTestCtx())!
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (String(n.props?.class ?? '').includes('wf-tag-close')) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  find(vnode).props.onClick()
  assert.equal(closed, 1)
})

it('非 closable 无关闭按钮（边界）', () => {
  const vnode = renderVNode(Tag, { children: 'x' }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-tag-close'))
})

it('variant 类（success/danger/primary）', () => {
  for (const v of ['success', 'danger', 'primary'] as const) {
    const vnode = renderVNode(Tag, { variant: v, children: 'x' }, createTestCtx())!
    assert.ok(JSON.stringify(vnode).includes(`wf-tag--${v}`))
  }
})

it('关闭按钮 aria-label（P1 无障碍名）', () => {
  const vnode = renderVNode(Tag, { closable: true, children: 'x' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('移除'))
})
