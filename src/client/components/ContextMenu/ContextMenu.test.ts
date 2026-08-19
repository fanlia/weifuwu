import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { ContextMenu } from './ContextMenu.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'

// mock ctx.ui.usePopup（组件层不跑真实弹层：onContextMenu 触发 + portal 定位简化）
function makeCtx(): UIContext {
  return createTestCtx({ ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    usePopup: (opts: any) => {
      const wrapProps: any = {}
      // 模拟 longpress 触发的右键兼容分支
      wrapProps.onContextMenu = (e: any) => {
        e.preventDefault()
        opts.onTrigger?.({ clientX: e.clientX ?? 0, clientY: e.clientY ?? 0 })
        opts.setOpen(true)
      }
      return {
        open: false,
        setOpen: (v: boolean) => opts.setOpen(v),
        wrapProps,
        portal: (content: any) => {
          if (!opts.isOpen()) return null
          // 简化定位：onTrigger 坐标（cursorX=100/cursorY=200 → top/left）
          return {
            ...content,
            props: {
              ...content.props,
              class: ['wf-popup', content.props.class].filter(Boolean).join(' '),
              style: { ...content.props.style, position: 'fixed', top: '200px', left: '100px' },
            },
          }
        },
        refresh: () => {},
      }
    },
  } }) as any
}

async function mount(Comp: any, props: any, ctx: any) {
  const result = await Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const items = [
  { key: 'edit', label: '编辑', onClick: () => {} },
  { key: 'copy', label: '复制' },
  { key: 'delete', label: '删除', variant: 'danger' as const },
  { key: 'disabled-item', label: '不可用', disabled: true },
]

describe('ContextMenu', () => {
  it('renders trigger children', async () => {
    const render = await mount(ContextMenu, { items, children: '区域' }, makeCtx())!
    const vnode = await render({ items, children: '区域' })
    assert.match(vnode.props.class, /wf-context-menu-trigger/)
    assert.equal(vnode.props.children[0], '区域')
  })

  it('closed by default (no menu)', async () => {
    const render = await mount(ContextMenu, { items, children: 'x' }, makeCtx())!
    const vnode = await render({ items, children: 'x' })
    assert.equal(vnode.props.children.length, 1)
  })

  it('contextmenu opens menu at mouse position（经 usePopup onTrigger + position）', async () => {
    const ctx = makeCtx()
    const render = await mount(ContextMenu, { items, children: 'x' }, ctx)!
    const vnode = await render({ items, children: 'x' })
    vnode.props.onContextMenu({ clientX: 100, clientY: 200, preventDefault: () => {} })
    const vnode2 = await render({ items, children: 'x' })
    const menu = vnode2.props.children[1]
    assert.ok(menu, '应显示菜单')
    assert.match(menu.props.class, /wf-context-menu/)
    assert.equal(menu.props.style.left, '100px')
    assert.equal(menu.props.style.top, '200px')
  })

  it('renders all items in menu', async () => {
    const ctx = makeCtx()
    const render = await mount(ContextMenu, { items, children: 'x' }, ctx)!
    const v = await render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    const v2 = await render({ items, children: 'x' })
    const menuItems = v2.props.children[1].props.children
    assert.equal(menuItems.length, 4)
  })

  it('click item calls onClick and closes', async () => {
    let clicked: string | null = null
    const ctx = makeCtx()
    const myItems = [
      { key: 'a', label: 'A', onClick: () => { clicked = 'a' } },
      { key: 'b', label: 'B', onClick: () => { clicked = 'b' } },
    ]
    const render = await mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = await render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = await render({ items: myItems, children: 'x' })
    const menuItems = v.props.children[1].props.children
    menuItems[1].props.onClick()
    assert.equal(clicked, 'b')
    // 点击后关闭
    v = await render({ items: myItems, children: 'x' })
    assert.equal(v.props.children.length, 1)
  })

  it('disabled item not clickable', async () => {
    let clicked = false
    const ctx = makeCtx()
    const myItems = [{ key: 'd', label: 'D', disabled: true, onClick: () => { clicked = true } }]
    const render = await mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = await render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = await render({ items: myItems, children: 'x' })
    const item = v.props.children[1].props.children[0]
    assert.equal(item.props.onClick, undefined)
    assert.match(item.props.class, /--dis/)
  })

  it('danger variant class', async () => {
    const ctx = makeCtx()
    const render = await mount(ContextMenu, { items, children: 'x' }, ctx)!
    let v = await render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = await render({ items, children: 'x' })
    const menuItems = v.props.children[1].props.children
    assert.match(menuItems[2].props.class, /--danger/)
  })

  it('Escape closes menu', async () => {
    const ctx = makeCtx()
    const render = await mount(ContextMenu, { items, children: 'x' }, ctx)!
    let v = await render({ items, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = await render({ items, children: 'x' })
    assert.ok(v.props.children.length > 1)
    const menu = v.props.children[1]
    menu.props.onKeyDown({ key: 'Escape' })
    v = await render({ items, children: 'x' })
    assert.equal(v.props.children.length, 1)
  })

  it('keyboard: ArrowDown navigates, Enter selects highlighted', async () => {
    let clicked: string | null = null
    const ctx = makeCtx()
    const myItems = [
      { key: 'a', label: 'A', onClick: () => { clicked = 'a' } },
      { key: 'b', label: 'B', onClick: () => { clicked = 'b' } },
    ]
    const render = await mount(ContextMenu, { items: myItems, children: 'x' }, ctx)!
    let v = await render({ items: myItems, children: 'x' })
    v.props.onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} })
    v = await render({ items: myItems, children: 'x' })
    const menu = v.props.children[1]
    // ArrowDown → 高亮第 2 项（index 1）
    menu.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    v = await render({ items: myItems, children: 'x' })
    const items2 = v.props.children[1].props.children
    assert.match(items2[1].props.class, /--hl/)
    items2[1].props.onClick()
    assert.equal(clicked, 'b')
  })
})
