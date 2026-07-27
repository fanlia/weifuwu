import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tag } from './Tag.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tag', () => {
  it('renders tag text', () => {
    const vnode = Tag({ children: '标签' }, mockCtx())!
    assert.match(vnode.props.class, /wf-tag/)
    const text = vnode.props.children[0]
    assert.equal(text.props.children, '标签')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'danger'] as const) {
      const vnode = Tag({ variant: v, children: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-tag--${v}`))
    }
  })

  it('renders close button when closable', () => {
    const vnode = Tag({ closable: true, children: '可关闭' }, mockCtx())!
    const closeBtn = vnode.props.children[1]
    assert.ok(closeBtn)
    assert.match(closeBtn.props.class, /wf-tag-close/)
  })

  it('calls onClose when close button clicked', () => {
    let closed = false
    const vnode = Tag({ closable: true, onClose: () => { closed = true }, children: '标签' }, mockCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(closed, true)
  })
})
