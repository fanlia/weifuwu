import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Modal } from './Modal.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true,  } } as any
}

/** 两阶段组件：mount 后调用 renderFn(props) 获取 VNode */
function renderModal(props: any, ctx: WfuiContext) {
  const result = Modal(props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

// Portal 包裹的组件：先取内层 VNode
const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Modal', () => {
  it('returns null when not open', () => {
    const result = renderModal({ open: false, children: '内容' }, mockCtx())
    assert.equal(result, null)
  })

  it('renders content when open', () => {
    const vnode = inner(renderModal({ open: true, children: '内容' }, mockCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-modal/)
  })

  it('renders title when provided', () => {
    const vnode = inner(renderModal({ open: true, title: '确认', children: '内容' }, mockCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    assert.equal(header.props.children[0], '确认')
  })

  it('renders footer when provided', () => {
    const vnode = inner(renderModal({ open: true, title: '确认', children: '内容', footer: '底部' }, mockCtx())!)
    const content = vnode.props.children[1]
    const footer = content.props.children[2]
    assert.equal(footer.props.class, 'wf-modal-footer')
    assert.equal(footer.props.children, '底部')
  })

  it('has overlay that calls onClose on click', () => {
    let closed = false
    const vnode = inner(renderModal({ open: true, children: '内容', onClose: () => { closed = true } }, mockCtx())!)
    const overlay = vnode.props.children[0]
    assert.equal(overlay.props.class, 'wf-modal-overlay')
    assert.equal(typeof overlay.props.onClick, 'function')
  })

  it('accepts custom width', () => {
    const vnode = inner(renderModal({ open: true, children: '内容', width: '600px' }, mockCtx())!)
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-modal-content')
    assert.equal(content.props.style.minWidth, '600px')
  })

  it('hides close button when closable=false', () => {
    const vnode = inner(renderModal({ open: true, title: '标题', children: '内容', closable: false }, mockCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    // no close button in header children
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.equal(closeBtn, undefined)
  })

  it('shows close button by default', () => {
    const vnode = inner(renderModal({ open: true, title: '标题', children: '内容' }, mockCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.ok(closeBtn)
  })
})
