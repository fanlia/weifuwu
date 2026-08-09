import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { ContextMenu } from './ContextMenu.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true,
    useLongPress: (opts: any) => ({
      onPointerDown: (e: any) => { opts.onLongPress?.(e) },
      onPointerUp: () => {},
      onPointerLeave: () => {},
      onPointerMove: () => {},
      onContextMenu: (e: any) => { e.preventDefault(); opts.onLongPress?.(e) },
    }),
  } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const items = [
  { key: 'edit', label: '编辑', onClick: () => {} },
  { key: 'copy', label: '复制' },
  { key: 'delete', label: '删除', variant: 'danger' as const },
  { key: 'disabled-item', label: '不可用', disabled: true },
]

describe('ContextMenu', () => {
  it('renders trigger children', () => {
    const render = mount(ContextMenu, { items, children: '区域' }, mockCtx())!
    const vnode = render({ items, children: '区域' })
    assert.match(vnode.props.class, /wf-context-menu-trigger/)
    assert.equal(vnode.props.children[0], '区域')
  })

  it('closed by default (no menu)', () => {
    const render = mount(ContextMenu, { items, children: 'x' }, mockCtx())!
    const vnode = render({ items, children: 'x' })
    assert.equal(vnode.props.children.length, 1)
  })

  it('contextmenu opens menu at mouse position', () => {
    const ctx = mockCtx()
    const render = mount(ContextMenu, { items, children: 'x' }, ctx)!
    const vnode = render({ items, children: 'x' })
    vnode.props.onContextMenu({ clientX: 100, clientY: 200, preventDefault: () => {} })
    const vnode2 = render({ items, children: 'x' })
    const menu = vnode2.props.children[1]?.props?.children
    assert.ok(menu, '应显示菜单')
    assert.match(menu.props.class, /wf-context-menu/)
    assert.equal(menu.props.style.left, '100px')
    assert.equal(menu.props.style.top, '200px')
  })

  it('renders all items in menu', () => {
    const ctx = mockCtx()
    const render = mount(ContextMenu, { items, children: 'x' }, ctx)!
    const v = render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    const v2 = render({ items, children: 'x' })
    const menuItems = v2.props.children[1].props.children.props.children
    assert.equal(menuItems.length, 4)
  })

  it('click item calls onClick and closes', () => {
    let clicked: string | null = null
    const ctx = mockCtx()
    const myItems = [
      { key: 'a', label: 'A', onClick: () => { clicked = 'a' } },
      { key: 'b', label: 'B', onClick: () => { clicked = 'b' } },
    ]
    const render = mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = render({ items: myItems, children: 'x' })
    const menuItems = v.props.children[1].props.children.props.children
    menuItems[1].props.onClick()
    assert.equal(clicked, 'b')
    // 点击后关闭
    v = render({ items: myItems, children: 'x' })
    assert.equal(v.props.children.length, 1)
  })

  it('disabled item not clickable', () => {
    let clicked = false
    const ctx = mockCtx()
    const myItems = [{ key: 'd', label: 'D', disabled: true, onClick: () => { clicked = true } }]
    const render = mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = render({ items: myItems, children: 'x' })
    const item = v.props.children[1].props.children.props.children[0]
    assert.equal(item.props.onClick, undefined)
    assert.match(item.props.class, /--dis/)
  })

  it('danger variant class', () => {
    const ctx = mockCtx()
    const render = mount(ContextMenu, { items, children: 'x' }, ctx)!
    let v = render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = render({ items, children: 'x' })
    const menuItems = v.props.children[1].props.children.props.children
    assert.match(menuItems[2].props.class, /--danger/)
  })

  it('Escape closes menu', () => {
    const ctx = mockCtx()
    const render = mount(ContextMenu, { items, children: 'x' }, ctx)!
    let v = render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = render({ items, children: 'x' })
    assert.ok(v.props.children.length > 1)
    const menu = v.props.children[1].props.children
    menu.props.onKeyDown({ key: 'Escape' })
    v = render({ items, children: 'x' })
    assert.equal(v.props.children.length, 1)
  })

  it('keyboard: ArrowDown navigates, Enter selects highlighted', () => {
    let clicked: string | null = null
    const ctx = mockCtx()
    const myItems = [
      { key: 'a', label: 'A', onClick: () => { clicked = 'a' } },
      { key: 'b', label: 'B', onClick: () => { clicked = 'b' } },
    ]
    const render = mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = render({ items: myItems, children: 'x' })
    const menu = v.props.children[1].props.children
    // ArrowDown → 高亮第 2 项（index 1）
    menu.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    v = render({ items: myItems, children: 'x' })
    const items2 = v.props.children[1].props.children.props.children
    assert.match(items2[1].props.class, /--hl/)
    items2[1].props.onClick()
    assert.equal(clicked, 'b')
  })
})
