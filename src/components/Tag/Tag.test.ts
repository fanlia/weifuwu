import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tag } from './Tag.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tag', () => {
  it('renders tag text', () => {
    const vnode = renderVNode(Tag, { children: '标签' }, mockCtx())!
    assert.match(vnode.props.class, /wf-tag/)
    const text = vnode.props.children[0]
    assert.equal(text.props.children, '标签')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'danger'] as const) {
      const vnode = renderVNode(Tag, { variant: v, children: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-tag--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = renderVNode(Tag, { closable: true, children: '可关闭' }, mockCtx())!
    const closeBtn = vnode.props.children[1]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-tag-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = renderVNode(Tag, { closable: true, onClose: () => { closed = true }, children: '标签' }, mockCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(closed, true)
  })
})

it('closable 关闭按钮点击触发 onClose', () => {
  let closed = 0
  const vnode = renderVNode(Tag, { closable: true, onClose: () => closed++, children: 'x' }, mockCtx())!
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
  const vnode = renderVNode(Tag, { children: 'x' }, mockCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-tag-close'))
})

it('variant 类（success/danger/primary）', () => {
  for (const v of ['success', 'danger', 'primary'] as const) {
    const vnode = renderVNode(Tag, { variant: v, children: 'x' }, mockCtx())!
    assert.ok(JSON.stringify(vnode).includes(`wf-tag--${v}`))
  }
})

it('关闭按钮 aria-label（P1 无障碍名）', () => {
  const vnode = renderVNode(Tag, { closable: true, children: 'x' }, mockCtx())!
  assert.ok(JSON.stringify(vnode).includes('移除'))
})
