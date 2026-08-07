import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Dropdown } from './Dropdown.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }),  } } as any
}

/** Call component and get VNode (compatible with two-phase model) */
function renderVNode(Comp: any, props: any, ctx: WfuiContext) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Dropdown', () => {
  const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }

  it('renders trigger', () => {
    const vnode = renderVNode(Dropdown, { trigger }, mockCtx())!
    assert.equal(vnode.type, 'div')
    const firstChild = vnode.props.children[0]
    assert.equal(firstChild.props.children, '菜单')
  })

  it('renders menu when open', () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', onClick: () => {} },
    ]
    const vnode = renderVNode(Dropdown, { trigger, items, open: true }, mockCtx())!
    // children: [trigger, portalVNode]
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    assert.ok(portal, '应有 Portal VNode')
    const menu = inner(portal)
    assert.equal(menu.type, 'div')
    assert.match(menu.props.class, /wf-dropdown-menu/)
    assert.equal(menu.props.children.length, 2)
  })

  it('does not render menu when not open', () => {
    const vnode = renderVNode(Dropdown, { trigger, items: [{ label: '编辑', onClick: () => {} }] }, mockCtx())!
    assert.equal(vnode.props.children.length, 1) // only trigger, no portal
  })

  it('renders danger variant', () => {
    const items = [
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = renderVNode(Dropdown, { trigger, items, open: true }, mockCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = inner(portal)
    const btn = menu.props.children[0]
    assert.match(btn.props.class, /wf-dropdown-item--danger/)
  })

  it('renders items with correct labels', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = renderVNode(Dropdown, { trigger, items, open: true }, mockCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = inner(portal)
    assert.equal(menu.props.role, 'menu')
    assert.equal(menu.props.children[0].props.role, 'menuitem')
    assert.equal(menu.props.children[0].props.children, '编辑')
  })

  it('adds open class when open', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const vnode = renderVNode(Dropdown, { trigger, open: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-dropdown--open/)
  })

  it('包装层带 aria-haspopup / aria-expanded', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const closed = renderVNode(Dropdown, { trigger }, mockCtx())!
    assert.equal(closed.props['aria-haspopup'], 'menu')
    assert.equal(closed.props['aria-expanded'], 'false')
    const opened = renderVNode(Dropdown, { trigger, open: true }, mockCtx())!
    assert.equal(opened.props['aria-expanded'], 'true')
  })

  it('菜单内 Escape 触发 onOpenChange(false)', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const items = [{ label: '编辑' }, { label: '删除', variant: 'danger' as const }]
    let closed = 0
    const vnode = renderVNode(Dropdown, { trigger, items, open: true, onOpenChange: (v: boolean) => { if (!v) closed++ } }, mockCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = inner(portal)
    assert.equal(typeof menu.props.onKeyDown, 'function')
    menu.props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, 1)
    menu.props.onKeyDown({ key: 'Enter' })
    assert.equal(closed, 1, '非 Escape 键不关闭')
  })
})
