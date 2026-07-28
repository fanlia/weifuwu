import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Drawer } from './Drawer.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Drawer', () => {
  it('returns null when not open', () => {
    const vnode = Drawer({ open: false, title: '编辑' }, mockCtx())
    assert.equal(vnode, null)
  })

  it('renders panel when open', () => {
    const vnode = inner(Drawer({ open: true, title: '编辑' }, mockCtx())!)
    assert.match(vnode.props.class, /wf-drawer/)
    assert.equal(vnode.props.role, 'dialog')
    const panel = vnode.props.children[1]
    assert.match(panel.props.class, /wf-drawer-panel/)
  })

  it('renders title in header', () => {
    const vnode = inner(Drawer({ open: true, title: '用户编辑' }, mockCtx())!)
    const panel = vnode.props.children[1]
    const header = panel.props.children[0]
    assert.match(header.props.class, /wf-drawer-header/)
    assert.equal(header.props.children[0], '用户编辑')
  })

  it('renders right position by default', () => {
    const vnode = inner(Drawer({ open: true, title: '编辑' }, mockCtx())!)
    assert.match(vnode.props.class, /wf-drawer--right/)
    assert.match(vnode.props.children[1].props.class, /wf-drawer-panel--right/)
  })

  it('renders left position', () => {
    const vnode = inner(Drawer({ open: true, title: '菜单', position: 'left' }, mockCtx())!)
    assert.match(vnode.props.class, /wf-drawer--left/)
    assert.match(vnode.props.children[1].props.class, /wf-drawer-panel--left/)
  })

  it('renders footer when provided', () => {
    const vnode = inner(Drawer({ open: true, title: '编辑', footer: '操作按钮' }, mockCtx())!)
    const panel = vnode.props.children[1]
    const footer = panel.props.children[2]
    assert.match(footer.props.class, /wf-drawer-footer/)
    assert.equal(footer.props.children, '操作按钮')
  })

  it('renders children in body', () => {
    const vnode = inner(Drawer({ open: true, title: '编辑', children: '表单内容' }, mockCtx())!)
    const panel = vnode.props.children[1]
    const body = panel.props.children[1]
    assert.match(body.props.class, /wf-drawer-body/)
    assert.equal(body.props.children, '表单内容')
  })

  it('handles ESC keydown → exit animation → onClose', () => {
    let closed = false
    const ctx = mockCtx()
    let vnode = inner(Drawer({ open: true, title: '编辑', onClose: () => { closed = true } }, ctx)!)
    ctx.ui.ready = true
    vnode.props.onKeyDown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(closed, false)
    vnode = inner(Drawer({ open: true, title: '编辑', onClose: () => { closed = true } }, ctx)!)
    const panel = vnode.props.children[1]
    assert.equal(typeof panel.props.onAnimationEnd, 'function')
    panel.props.onAnimationEnd()
    assert.equal(closed, true)
  })
})
