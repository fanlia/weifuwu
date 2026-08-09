import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { NavMenu } from './NavMenu.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findVNode(kids, pred)
  }
  return null
}

function mount(Comp: any, props: any, ctx: any) {
  const factory = Comp({}, ctx)
  return { render: (p: any = props) => factory(p) }
}

const mockCtx = () => ({
  ui: { $: () => ({}), render: () => {}, dirty: () => {} },
}) as any

const items = [
  { key: 'home', label: '首页' },
  { key: 'docs', label: '文档', children: [
    { key: 'guide', label: '指南' },
    { key: 'api', label: 'API', children: [{ key: 'rest', label: 'REST' }] },
  ]},
  { key: 'about', label: '关于' },
]

describe('NavMenu', () => {
  test('渲染顶部导航：水平 flex + 顶层项', () => {
    const vnode = renderVNode(NavMenu, { items }, mockCtx())
    const nav = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu'))
    assert.ok(nav, '存在 nav 容器')
    const topItems = vnode.props.children
    assert.ok(Array.isArray(topItems) && topItems.length >= 3, '顶层项渲染')
  })

  test('含子菜单项显示展开箭头', () => {
    const vnode = renderVNode(NavMenu, { items }, mockCtx())
    const arrow = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-arrow'))
    assert.ok(arrow, '子菜单箭头')
  })

  test('hover 打开子菜单', () => {
    const ctx = mockCtx()
    const inst = mount(NavMenu, { items }, ctx)
    let vnode = inst.render({ items })
    // 找到 docs 项（含箭头 = 有子菜单）
    const docsItem = vnode.props.children[1]
    assert.ok(docsItem, 'docs 项存在')
    docsItem.props.onMouseEnter()
    vnode = inst.render({ items })
    const sub = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub--open'))
    assert.ok(sub, 'hover 打开子菜单')
    const subItems = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub-item'))
    assert.ok(subItems, '子菜单项存在')
  })

  test('点击顶层项 → onSelect', () => {
    let selected = ''
    const ctx = mockCtx()
    const inst = mount(NavMenu, { items, onSelect: (k: string) => { selected = k } }, ctx)
    const vnode = inst.render({ items, onSelect: (k: string) => { selected = k } })
    const first = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-item'))
    first.props.onClick()
    assert.equal(selected, 'home')
  })

  test('键盘：→ 打开子菜单 / Escape 关闭', () => {
    const ctx = mockCtx()
    const inst = mount(NavMenu, { items }, ctx)
    // → 键聚焦 docs → 打开
    let vnode = inst.render({ items, activeKey: 'docs' })
    const docsItem = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-item'))
    docsItem.props.onKeyDown?.({ key: 'Escape', stopPropagation: () => {} })
    vnode = inst.render({ items })
    const sub = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub--open'))
    assert.equal(sub, null, 'Escape 关闭子菜单')
  })

  test('activeKey 受控高亮', () => {
    const vnode = renderVNode(NavMenu, { items, activeKey: 'about' }, mockCtx())
    const active = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-item--active'))
    assert.ok(active, '受控高亮项')
  })
})
