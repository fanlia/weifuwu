import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Drawer } from './Drawer.ts'
import { Portal } from '../../vdom/core/node/portal.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'

function makeCtx(): UIContext {
  let phase: 'closed' | 'open' | 'exit' = 'closed'
  return createTestCtx({ ui: {
    $: () => ({}), render: () => {}, dirty: () => {},
    useGlobalKey: () => () => {},
    usePopup: () => ({
      get phase() { return phase },
      get open() { return phase !== 'closed' },
      setOpen: (v: boolean) => { if (v) phase = 'open'; else if (phase === 'open') phase = 'exit' },
      sync: (open: boolean) => {
        if (open) phase = 'open'
        else if (phase === 'open') phase = 'exit'
        return phase
      },
      wrapProps: {}, portal: (c: any) => c, refresh: () => {},
    }),
  } }) as any
}

/** 两阶段组件：mount 后调用 renderFn(props) */
async function renderDrawer(props: any, ctx: UIContext) {
  const result = await Drawer(props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Drawer', () => {
  it('returns null when not open', async () => {
    const vnode = await renderDrawer({ open: false, title: '编辑' }, makeCtx())
    assert.equal(vnode, null)
  })

  it('renders panel when open', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑' }, makeCtx())!)
    assert.match(vnode.props.class, /wf-drawer/)
    assert.equal(vnode.props.role, 'dialog')
    const panel = vnode.props.children[1]
    assert.match(panel.props.class, /wf-drawer-panel/)
  })

  it('renders title in header', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '用户编辑' }, makeCtx())!)
    const panel = vnode.props.children[1]
    const header = panel.props.children[0]
    assert.match(header.props.class, /wf-drawer-header/)
    assert.equal(header.props.children[0], '用户编辑')
  })

  it('renders right position by default', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑' }, makeCtx())!)
    assert.match(vnode.props.class, /wf-drawer--right/)
    assert.match(vnode.props.children[1].props.class, /wf-drawer-panel--right/)
  })

  it('renders left position', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '菜单', position: 'left' }, makeCtx())!)
    assert.match(vnode.props.class, /wf-drawer--left/)
    assert.match(vnode.props.children[1].props.class, /wf-drawer-panel--left/)
  })

  it('renders footer when provided', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', footer: '操作按钮' }, makeCtx())!)
    const panel = vnode.props.children[1]
    const footer = panel.props.children[2]
    assert.match(footer.props.class, /wf-drawer-footer/)
    assert.equal(footer.props.children, '操作按钮')
  })

  it('renders children in body', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', children: '表单内容' }, makeCtx())!)
    const panel = vnode.props.children[1]
    const body = panel.props.children[1]
    assert.match(body.props.class, /wf-drawer-body/)
    assert.equal(body.props.children, '表单内容')
  })

  it('handles ESC keydown → exit animation → onClose', async () => {
    let closed = false
    const ctx = makeCtx()
    const result = await Drawer({ open: true, title: '编辑', onClose: () => { closed = true } }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    const vnode = await inner(await renderFn!({ open: true, title: '编辑', onClose: () => { closed = true } })!)
    // ESC → onClose
    vnode.props.onKeyDown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(closed, true)
  })

  it('遮罩点击关闭（无 maskClosable——默认关闭）', async () => {
    let closed = 0
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', onClose: () => closed++ }, makeCtx())!)
    const overlay = vnode.props.children[0]
    assert.match(overlay.props.class, /wf-drawer-overlay/)
    assert.equal(typeof overlay.props.onClick, 'function')
    overlay.props.onClick()
    assert.equal(closed, 1)
  })

  it('面板点击 stopPropagation（不冒泡到遮罩关闭）', async () => {
    let closed = 0
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', onClose: () => closed++ }, makeCtx())!)
    const panel = vnode.props.children[1]
    const fake = { stopPropagation: () => { (fake as any).stopped = true } } as any
    panel.props.onClick(fake)
    assert.equal((fake as any).stopped, true)
    assert.equal(closed, 0)
  })

  it('关闭按钮点击触发 onClose + aria-label', async () => {
    let closed = 0
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', onClose: () => closed++ }, makeCtx())!)
    const panel = vnode.props.children[1]
    const header = panel.props.children[0]
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-drawer-close')
    assert.ok(closeBtn)
    assert.equal(closeBtn.props['aria-label'], '关闭')
    closeBtn.props.onClick()
    assert.equal(closed, 1)
  })

  it('aria：role=dialog + aria-modal + aria-label=title + tabIndex=-1', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑表单', children: 'x' }, makeCtx())!)
    assert.equal(vnode.props.role, 'dialog')
    assert.equal(vnode.props['aria-modal'], 'true')
    assert.equal(vnode.props['aria-label'], '编辑表单')
    assert.equal(vnode.props.tabIndex, -1)
  })

  it('width 经 CSS 变量 --wf-drawer-width 传递', async () => {
    const vnode = await inner(await renderDrawer({ open: true, title: '编辑', children: 'x', width: '480px' }, makeCtx())!)
    const panel = vnode.props.children[1]
    assert.equal(panel.props.style['--wf-drawer-width'], '480px')
  })
})
