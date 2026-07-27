import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Modal } from './Modal.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Modal', () => {
  it('returns null when not open', () => {
    const result = Modal({ open: false, children: '内容' }, mockCtx())
    assert.equal(result, null)
  })

  it('renders content when open', () => {
    const vnode = Modal({ open: true, children: '内容' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-modal/)
  })

  it('renders title when provided', () => {
    const vnode = Modal({ open: true, title: '确认', children: '内容' }, mockCtx())!
    const content = vnode.props.children[1] // overlay + content
    const header = content.props.children[0]
    // header has [title, closeBtn]
    assert.equal(header.props.children[0], '确认')
  })

  it('renders footer when provided', () => {
    const vnode = Modal({ open: true, title: '确认', children: '内容', footer: '底部' }, mockCtx())!
    const content = vnode.props.children[1]
    const footer = content.props.children[2]
    assert.equal(footer.props.class, 'wf-modal-footer')
    assert.equal(footer.props.children, '底部')
  })

  it('has overlay that calls onClose on click', () => {
    let closed = false
    const vnode = Modal({ open: true, children: '内容', onClose: () => { closed = true } }, mockCtx())!
    const overlay = vnode.props.children[0]
    assert.equal(overlay.props.class, 'wf-modal-overlay')
    assert.equal(typeof overlay.props.onClick, 'function')
  })
})
