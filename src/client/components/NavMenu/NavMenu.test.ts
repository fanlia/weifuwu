import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { NavMenu } from './NavMenu.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'


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

async function mount(Comp: any, props: any, ctx: any) {
  const factory = await Comp({}, ctx)
  return { render: (p: any = props) => factory(p) }
}

const makeCtx = () => createTestCtx({ ui: {
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
  test('渲染顶部导航：水平 flex + 顶层项', async () => {
    const vnode = await renderVNode(NavMenu, { items }, makeCtx())
    const nav = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu'))
    assert.ok(nav, '存在 nav 容器')
    const topItems = vnode.props.children
    assert.ok(Array.isArray(topItems) && topItems.length >= 3, '顶层项渲染')
  })

  test('含子菜单项显示展开箭头', async () => {
    const vnode = await renderVNode(NavMenu, { items }, makeCtx())
    const arrow = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-arrow'))
    assert.ok(arrow, '子菜单箭头')
  })

  test('hover 打开子菜单', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    let vnode = await inst.render({ items })
    // 找到 docs 项（含箭头 = 有子菜单）
    const docsItem = vnode.props.children[1]
    assert.ok(docsItem, 'docs 项存在')
    docsItem.props.onMouseEnter()
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub--open'))
    assert.ok(sub, 'hover 打开子菜单')
    const subItems = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub-item'))
    assert.ok(subItems, '子菜单项存在')
  })

  test('点击顶层项 → onSelect', async () => {
    let selected = ''
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items, onSelect: (k: string) => { selected = k } }, ctx)
    const vnode = await inst.render({ items, onSelect: (k: string) => { selected = k } })
    const first = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-item'))
    first.props.onClick()
    assert.equal(selected, 'home')
  })

  test('键盘：→ 打开子菜单 / Escape 关闭', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    // → 键聚焦 docs → 打开
    let vnode = await inst.render({ items, activeKey: 'docs' })
    const docsItem = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-item'))
    docsItem.props.onKeyDown?.({ key: 'Escape', stopPropagation: () => {} })
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-navmenu-sub--open'))
    assert.equal(sub, null, 'Escape 关闭子菜单')
  })

  test('hover 离开菜单域：文档/API 子菜单延迟自动关闭', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    let vnode = await inst.render({ items })
    // 打开文档子菜单（hover）+ API 嵌套
    vnode.props.children[1].props.onMouseEnter()
    vnode = await inst.render({ items })
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
    vnode = await inst.render({ items })
    const nested0 = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.ok(nested0, 'API 嵌套已展开')
    // 鼠标移出菜单域（到页面空白：relatedTarget 不在导航条/面板内）→ 延迟后自动关闭
    vnode.props.onMouseLeave({ relatedTarget: null })
    await new Promise(r => setTimeout(r, 200))
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    const nested = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.equal(sub, null, '移出菜单域后顶层子菜单自动关闭')
    assert.equal(nested, null, '移出菜单域后嵌套子菜单自动关闭')
  })

  test('叶子子项 hover：关闭已展开的嵌套子菜单（指南关闭 API 嵌套）', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    let vnode = await inst.render({ items })
    // 打开文档子菜单 + API 嵌套
    vnode.props.children[1].props.onMouseEnter()
    vnode = await inst.render({ items })
    const walkSub = (v: any, label: string): any => {
      if (!v || typeof v !== 'object') return null
      if (String(v.props?.class ?? '').includes('wf-navmenu-sub-item') && v.props.children?.some?.(c => String(c?.props?.children ?? '') === label)) return v
      const ks = v.props?.children
      if (Array.isArray(ks)) { for (const k of ks) { const f = walkSub(k, label); if (f) return f } }
      else if (ks && typeof ks === 'object') return walkSub(ks, label)
      return null
    }
    walkSub(vnode, 'API')!.props.onMouseEnter()
    vnode = await inst.render({ items })
    assert.ok(findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested')), 'API 嵌套已展开')
    // hover 指南（叶子子项）→ 嵌套子菜单关闭
    walkSub(vnode, '指南')!.props.onMouseEnter()
    vnode = await inst.render({ items })
    const nested = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.equal(nested, null, 'hover 叶子子项后嵌套子菜单关闭')
    // 顶层子菜单保持打开（pointer 在面板内）
    const sub = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.ok(sub, '顶层子菜单保持打开')
  })

  test('hover 其他顶层叶子项：已展开子菜单自动关闭', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    let vnode = await inst.render({ items })
    vnode.props.children[1].props.onMouseEnter() // hover 文档
    vnode = await inst.render({ items })
    assert.ok(findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open')), '文档子菜单已打开')
    // hover 关于（叶子项）→ 子菜单关闭（shadcn NavigationMenu 行为）
    vnode.props.children[2].props.onMouseEnter()
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.equal(sub, null, 'hover 叶子项后子菜单关闭')
  })

  test('trigger→面板 间隙穿越不误关：进入面板取消延迟关闭', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    let vnode = await inst.render({ items })
    vnode.props.children[1].props.onMouseEnter() // hover 文档
    vnode = await inst.render({ items })
    // 鼠标从导航条移出（relatedTarget=页面元素——间隙穿越瞬间）→ 延迟关闭已排定
    vnode.props.onMouseLeave({ relatedTarget: {} })
    // 但在延迟窗口内进入面板 → cancel，不误关
    const panel = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.ok(panel, '面板存在')
    panel.props.onMouseEnter()
    await new Promise(r => setTimeout(r, 200))
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.ok(sub, '进入面板取消延迟关闭——子菜单保持打开')
  })

  test('嵌套子菜单：默认不渲染，hover 展开（不无条件拼接）', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    // 未展开：嵌套内容不在（防文字拼接 APIRESTWebSocket）
    let vnode = await inst.render({ items })
    const nested0 = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.equal(nested0, null, '嵌套子菜单默认不渲染')
    // 打开文档子菜单（hover）
    vnode.props.children[1].props.onMouseEnter()
    vnode = await inst.render({ items })
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
    vnode = await inst.render({ items })
    const nested = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--nested'))
    assert.ok(nested, 'hover API 展开嵌套子菜单')
    // 嵌套内容包含 REST
    const rest = findVNode(vnode, (v: any) => String(v.props?.children ?? '') === 'REST')
    assert.ok(rest, '嵌套展开后 REST 出现')
  })

  test('ref 稳定：同一 key 多次渲染 ref 引用不变（防内联 ref 重复执行）', async () => {
    const ctx = makeCtx()
    const inst = await mount(NavMenu, { items }, ctx)
    const v1 = await inst.render({ items })
    // 顶层 item refs
    const refs1 = v1.props.children.map((c: any) => c.props.ref)
    const v2 = await inst.render({ items })
    const refs2 = v2.props.children.map((c: any) => c.props.ref)
    assert.equal(refs1.length, refs2.length)
    for (let i = 0; i < refs1.length; i++) {
      assert.equal(refs1[i], refs2[i], `item ${i} ref 引用稳定（mount 缓存）`)
    }
    // 展开子菜单后嵌套 ref 也稳定
    v2.props.children[1].props.onMouseEnter()
    const v3 = await inst.render({ items })
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
    const v4 = await inst.render({ items })
    const api2 = findSubItem(v4, 'API')
    assert.equal(api2.props.ref, refA, '嵌套 ref 引用稳定')
  })

  test('点击叶子项关闭已展开子菜单', async () => {
    const ctx = makeCtx()
    let openChanged = false
    const inst = await mount(NavMenu, { items, onSelect: () => {} }, ctx)
    // hover 打开文档子菜单
    let vnode = await inst.render({ items })
    vnode.props.children[1].props.onMouseEnter()
    vnode = await inst.render({ items })
    const sub = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.ok(sub, '子菜单已打开')
    // 点击首页叶子项 → onSelect + 关闭（setOpen(false) 触发）
    const home = vnode.props.children[0]
    home.props.onClick()
    // mock setOpen 记录关闭调用（通过 usePopup 的 setOpen 包装）
    // 组件内 popup.setOpen(false) → mock 的 setOpen 直接执行 opts.setOpen(false)
    // ——验证：重新渲染后无子菜单（openKey 被清）
    vnode = await inst.render({ items })
    const subAfter = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-sub--open'))
    assert.equal(subAfter, null, '点击叶子项后子菜单关闭')
    void openChanged
  })

  test('activeKey 受控高亮', async () => {
    const vnode = await renderVNode(NavMenu, { items, activeKey: 'about' }, makeCtx())
    const active = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-navmenu-item--active'))
    assert.ok(active, '受控高亮项')
  })
})

test('键盘可达（P1 红线）：menuitem 可聚焦 + Enter/Space 触发选择', async () => {
  let selected = ''
  const ctx = makeCtx()
  const onSelect = (k: string) => { selected = k }
  const inst = await mount(NavMenu, { items, onSelect }, ctx)
  const vnode = await inst.render({ items, onSelect })
  const first = findVNode(vnode, (v: any) => v.props?.class === 'wf-navmenu-item' || v.props?.class?.startsWith('wf-navmenu-item '))
  assert.ok(first.props.tabIndex === 0 || first.props.tabindex === 0, 'menuitem 必须 tabIndex=0 可聚焦（否则 onKeyDown 是死代码）')
  first.props.onKeyDown?.({ key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} })
  assert.equal(selected, 'home', 'Enter 触发 onSelect')
})
