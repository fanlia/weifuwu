import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tag } from './Tag.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Tag', () => {
  it('renders tag text', async () => {
    const vnode = await renderVNode(Tag, { children: '标签' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-tag/)
    const text = vnode.props.children[0]
    assert.equal(text.props.children, '标签')
  })

  it('renders all variants', async () => {
    for (const v of ['default', 'primary', 'success', 'danger'] as const) {
      const vnode = await renderVNode(Tag, { variant: v, children: v }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-tag--${v}`))
    }
  })

  it('renders close button when closable', async () => {
    const vnode = await renderVNode(Tag, { closable: true, children: '可关闭' }, createTestCtx())!
    const closeBtn = vnode.props.children[1]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-tag-close/)
  })

  it('calls onClose when close button clicked', async () => {
    let closed = false
    const vnode = await renderVNode(Tag, { closable: true, onClose: () => { closed = true }, children: '标签' }, createTestCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(closed, true)
  })
})

it('closable 关闭按钮点击触发 onClose', async () => {
  let closed = 0
  const vnode = await renderVNode(Tag, { closable: true, onClose: () => closed++, children: 'x' }, createTestCtx())!
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

it('非 closable 无关闭按钮（边界）', async () => {
  const vnode = await renderVNode(Tag, { children: 'x' }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-tag-close'))
})

it('variant 类（success/danger/primary）', async () => {
  for (const v of ['success', 'danger', 'primary'] as const) {
    const vnode = await renderVNode(Tag, { variant: v, children: 'x' }, createTestCtx())!
    assert.ok(JSON.stringify(vnode).includes(`wf-tag--${v}`))
  }
})

it('关闭按钮 aria-label（P1 无障碍名）', async () => {
  const vnode = await renderVNode(Tag, { closable: true, children: 'x' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('移除'))
})
