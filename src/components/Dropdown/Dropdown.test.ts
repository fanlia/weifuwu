import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Dropdown } from './Dropdown.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** usePopup mock：镜像真实语义（受控 isOpen + wf-popup 合并 + Escape via wrapProps） */
function makeCtx(): WfuiContext {
  const openStates = new Map<string, boolean>()
  return createTestCtx({ ui: {
    useOpen: (opts: any) => {
      const key = opts.name ?? 'default'
      if (!openStates.has(key)) openStates.set(key, false)
      const controlled = opts.open !== undefined
      const isOpen = () => controlled ? !!opts.open : (openStates.get(key) ?? false)
      const setOpen = (v: boolean) => {
        if (controlled) opts.onOpenChange?.(v)
        else openStates.set(key, v)
      }
      return {
        get open() { return isOpen() },
        setOpen,
        triggerProps: { onClick: () => setOpen(true), onFocus: () => {} },
      }
    },
    usePopup: (opts: any) => {
      // 对齐真实 usePopup：isOpen 是函数（迁移后无 open 参数——用 isOpen()）
      const isOpen = () => (opts.isOpen ? opts.isOpen() : false)
      const portal = (content: any) => {
        if (!isOpen()) return null
        return {
          type: Portal,
          props: {
            children: { ...content, props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' ') } },
            portalKey: 'dropdown',
          },
          key: undefined,
          _placement: 'remote',
        }
      }
      return {
        open: isOpen(),
        setOpen: (v: any) => { opts.onOpenChange?.(v) },
        wrapProps: {
          onClick: () => {},
          // 对齐真实 usePopup：Escape 调 setOpen（受控走 onOpenChange）
          onKeyDown: (e: any) => { if (e.key === 'Escape') opts.setOpen?.(false) },
        },
        portal,
        refresh: () => {},
      }
    },
  } }) as any
}

/** Call component and get VNode (compatible with two-phase model) */

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Dropdown', () => {
  const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }

  it('renders trigger', async () => {
    const vnode = await renderVNode(Dropdown, { trigger }, makeCtx())!
    assert.equal(vnode.type, 'div')
    const firstChild = vnode.props.children[0]
    assert.equal(firstChild.props.children, '菜单')
  })

  it('renders menu when open', async () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    // children: [trigger, portalVNode]
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    assert.ok(portal, '应有 Portal VNode')
    const menu = await inner(portal)
    assert.equal(menu.type, 'div')
    assert.match(menu.props.class, /wf-dropdown-menu/)
    assert.match(menu.props.class, /wf-popup/, 'usePopup 附加 wf-popup 基类')
    assert.equal(menu.props.children.length, 2)
  })

  it('does not render menu when not open', async () => {
    const vnode = await renderVNode(Dropdown, { trigger, items: [{ label: '编辑', onClick: () => {} }] }, makeCtx())!
    assert.equal(vnode.props.children.length, 1) // only trigger, no portal
  })

  it('renders danger variant', async () => {
    const items = [
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = await inner(portal)
    const btn = menu.props.children[0]
    assert.match(btn.props.class, /wf-dropdown-item--danger/)
  })

  it('renders items with correct labels', async () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = await inner(portal)
    assert.equal(menu.props.role, 'menu')
    assert.equal(menu.props.children[0].props.role, 'menuitem')
    assert.equal(menu.props.children[0].props.children, '编辑')
  })

  it('adds open class when open', async () => {
    const vnode = await renderVNode(Dropdown, { trigger, open: true }, makeCtx())!
    assert.match(vnode.props.class, /wf-dropdown--open/)
  })

  it('包装层带 aria-haspopup / aria-expanded', async () => {
    const closed = await renderVNode(Dropdown, { trigger }, makeCtx())!
    assert.equal(closed.props['aria-haspopup'], 'menu')
    assert.equal(closed.props['aria-expanded'], 'false')
    const opened = await renderVNode(Dropdown, { trigger, open: true }, makeCtx())!
    assert.equal(opened.props['aria-expanded'], 'true')
  })

  it('Escape 触发 onOpenChange(false)（wrapProps，document 级语义）', async () => {
    const items = [{ label: '编辑' }, { label: '删除', variant: 'danger' as const }]
    let closed = 0
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true, onOpenChange: (v: boolean) => { if (!v) closed++ } }, makeCtx())!
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    vnode.props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, 1)
    vnode.props.onKeyDown({ key: 'Enter' })
    assert.equal(closed, 1, '非 Escape 键不关闭')
  })
})
