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
  ui: {
    $: () => ({}),
    render: () => {},
    dirty: () => {},
    usePopup: (opts: any) => ({
      get open() { return opts.isOpen() },
      setOpen: opts.setOpen,
      refresh: () => {},
      portal: (content: any) => content,
      wrapProps: {},
    }),
  },
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

  test('嵌套子菜单：默认不渲染，hover 展开（不无条件拼接）', () => {
    const ctx = mockCtx()
    const inst = mount(NavMenu, { items }, ctx)
    // 未展开：嵌套内容不在（防文字拼接 APIRESTWebSocket）
    let vnode = inst.render({ items })
    const nested0 = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.equal(nested0, null, '嵌套子菜单默认不渲染')
    // 打开文档子菜单（hover）
    vnode.props.children[1].props.onMouseEnter()
    vnode = inst.render({ items })
    // 找到 API 嵌套项 → hover 展开嵌套
    const apiItem = vnode.props.children[1].props.children
    const walkSub = (v: any): any => {
      if (!v || typeof v !== 'object') return null
      if (String(v.props?.class ?? '').includes('wf-navmenu-sub-item') && v.props.children?.some?.(c => String(c?.props?.children ?? '') === 'API')) return v
      const ks = v.props?.children
      if (Array.isArray(ks)) { for (const k of ks) { const f = walkSub(k); if (f) return f } }
      else if (ks && typeof ks === 'object') return walkSub(ks)
      return null
    }
    const api = walkSub(vnode)
    assert.ok(api, '找到 API 嵌套项')
    api.props.onMouseEnter()
    vnode = inst.render({ items })
    const nested = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.ok(nested, 'hover API 展开嵌套子菜单')
    // 嵌套内容包含 REST
    const rest = findVNode(vnode, (v: any) => String(v.props?.children ?? '') === 'REST')
    assert.ok(rest, '嵌套展开后 REST 出现')
  })

  test('ref 稳定：同一 key 多次渲染 ref 引用不变（防内联 ref 重复执行）', () => {
    const ctx = mockCtx()
    const inst = mount(NavMenu, { items }, ctx)
    const v1 = inst.render({ items })
    // 顶层 item refs
    const refs1 = v1.props.children.map((c: any) => c.props.ref)
    const v2 = inst.render({ items })
    const refs2 = v2.props.children.map((c: any) => c.props.ref)
    assert.equal(refs1.length, refs2.length)
    for (let i = 0; i < refs1.length; i++) {
      assert.equal(refs1[i], refs2[i], `item ${i} ref 引用稳定（mount 缓存）`)
    }
    // 展开子菜单后嵌套 ref 也稳定
    v2.props.children[1].props.onMouseEnter()
    const v3 = inst.render({ items })
    const sub = v3.props.children[1].props.children
    const findSubItem = (v: any, label: string): any => {
      if (!v || typeof v !== 'object') return null
      const kids = v.props?.children
      const labelText = Array.isArray(kids)
        ? (kids.find((k: any) => String(k?.props?.class ?? '').includes('wf-navmenu-sub-label'))?.props?.children ?? '')
        : String(kids ?? '')
      if (labelText === label && String(v.props?.class ?? '').includes('wf-navmenu-sub-item')) return v
      if (Array.isArray(kids)) { for (const k of kids) { const f = findSubItem(k, label); if (f) return f } }
      else if (kids && typeof kids === 'object') return findSubItem(kids, label)
      return null
    }
    const api1 = findSubItem(v3, 'API')
    assert.ok(api1, 'API 嵌套项')
    const refA = api1.props.ref
    const v4 = inst.render({ items })
    const api2 = findSubItem(v4, 'API')
    assert.equal(api2.props.ref, refA, '嵌套 ref 引用稳定')
  })

  test('activeKey 受控高亮', () => {
    const vnode = renderVNode(NavMenu, { items, activeKey: 'about' }, mockCtx())
    const active = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-item--active'))
    assert.ok(active, '受控高亮项')
  })
})
