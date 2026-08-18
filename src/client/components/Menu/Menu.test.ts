import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Menu } from './Menu.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

function createTestCtx(): WfuiContext {
  return { ui: { render: () => {}, ready: true, usePopup: () => ({ wrapProps: {}, portal: (c: any) => c }) } } as any
}

const items = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'users', label: '用户管理' },
  { key: 'settings', label: '设置' },
]

describe('Menu', () => {
  it('渲染 nav + 导航项（role=menuitem）', async () => {
    const vnode = await renderVNode(Menu, { items }, createTestCtx())!
    assert.equal(vnode.type, 'nav')
    assert.match(vnode.props.class, /wf-menu/)
    const itemEls = vnode.props.children.filter((c: any) => c?.props?.role === 'menuitem')
    assert.equal(itemEls.length, 3)
    assert.equal(itemEls[0].props.children[1].props.children, '首页') // label span
  })

  it('activeKey 高亮类', async () => {
    const vnode = await renderVNode(Menu, { items, activeKey: 'users' }, createTestCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'users')
    assert.match(item.props.class, /wf-menu-item--active/)
    assert.equal(item.props['aria-current'], 'page')
  })

  it('分组渲染分组标题', async () => {
    const grouped = [
      { key: 'a', label: 'A', group: '工作台' },
      { key: 'b', label: 'B', group: '管理' },
      { key: 'c', label: 'C', group: '管理' },
    ]
    const vnode = await renderVNode(Menu, { items: grouped }, createTestCtx())!
    const texts = collectText(vnode)
    assert.ok(texts.includes('工作台'))
    assert.ok(texts.includes('管理'))
  })

  it('点击项 → onSelect(key)', async () => {
    let picked = ''
    const vnode = await renderVNode(Menu, { items, onSelect: (k: string) => { picked = k } }, createTestCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'settings')
    item.props.onClick()
    assert.equal(picked, 'settings')
  })

  it('onClick 优先于 onSelect（item 自身处理）', async () => {
    let picked = ''
    let clicked = ''
    const vnode = await renderVNode(Menu, {
      items: [{ key: 'x', label: 'X', onClick: () => { clicked = 'x' } }],
      onSelect: (k: string) => { picked = k },
    }, createTestCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'x')
    item.props.onClick()
    assert.equal(clicked, 'x')
    assert.equal(picked, '')
  })
})

function collectText(v: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.props?.children != null) walk(n.props.children)
  }
  walk(v)
  return out
}

// ── 第六批：子菜单/折叠（TDD 红→绿） ──────────────────────────

const submenuItems = [
  { key: 'home', label: '首页' },
  {
    key: 'sys', label: '系统管理', icon: '⚙️',
    children: [
      { key: 'sys-users', label: '用户管理' },
      { key: 'sys-roles', label: '角色权限' },
    ],
  },
  { key: 'settings', label: '设置' },
]

function findV(vnode: any, pred: (n: any) => boolean): any {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const ch = vnode.props?.children
  if (ch == null) return null
  const arr = Array.isArray(ch) ? ch : [ch]
  for (const c of arr) {
    const r = findV(c, pred)
    if (r) return r
  }
  return null
}

describe('Menu 子菜单', () => {
  it('渲染子菜单容器 + 子级项', async () => {
    const vnode = await renderVNode(Menu, { items: submenuItems }, createTestCtx())!
    const sub = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu'))
    assert.ok(sub, '应有 .wf-menu-submenu 容器')
    const title = sub.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-title'))
    assert.ok(title, '应有子菜单标题')
    assert.equal(title.props['aria-expanded'], 'false')
    // 子级项在 content 容器里
    const content = sub.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-content'))
    assert.ok(content, '应有子菜单内容容器')
    const kids = content.props.children.filter((c: any) => c.props?.['data-key'])
    assert.equal(kids.length, 2)
    assert.equal(kids[0].props['data-key'], 'sys-users')
  })

  it('点击标题展开（非受控）：aria-expanded true + 子项可聚焦', async () => {
    // 同一组件实例（mount 一次 render 多次）——内部闭包状态跨 render 保持
    const factory = await Menu({} as any, createTestCtx())
    let vnode = await factory({ items: submenuItems })!
    const sub = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu'))
    const title = sub.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-title'))
    title.props.onClick()
    // 重渲染后展开
    vnode = await factory({ items: submenuItems })!
    const sub2 = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu'))
    const title2 = sub2.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-title'))
    assert.equal(title2.props['aria-expanded'], 'true')
    assert.match(sub2.props.class, /wf-menu-submenu--open/)
  })

  it('受控 openKeys：点击标题回传 onOpenChange', async () => {
    let got: string[] = []
    const vnode = await renderVNode(Menu, {
      items: submenuItems,
      openKeys: ['sys'],
      onOpenChange: (keys: string[]) => { got = keys },
    }, createTestCtx())!
    const sub = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu'))
    assert.match(sub.props.class, /wf-menu-submenu--open/) // 受控已开
    const title = sub.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-title'))
    title.props.onClick() // 点击 → 收起请求
    assert.deepEqual(got, [])
  })

  it('键盘：标题 Enter 展开 / 再次 Enter 收起', async () => {
    const factory = await Menu({} as any, createTestCtx())
    let vnode = await factory({ items: submenuItems })!
    const sub = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu'))
    const title = sub.props.children.find((c: any) => c.props?.class?.includes('wf-menu-submenu-title'))
    title.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    vnode = await factory({ items: submenuItems })!
    const title2 = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu-title'))
    assert.equal(title2.props['aria-expanded'], 'true')
    title2.props.onKeyDown({ key: 'Escape', preventDefault: () => {} })
    vnode = await factory({ items: submenuItems })!
    const title3 = findV(vnode, (n) => n.props?.class?.includes('wf-menu-submenu-title'))
    assert.equal(title3.props['aria-expanded'], 'false')
  })

  it('折叠模式：collapsed 隐藏 label 与子级', async () => {
    const vnode = await renderVNode(Menu, { items: submenuItems, collapsible: true, collapsed: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-menu--collapsed/)
    const label = findV(vnode, (n) => n.props?.class?.includes('wf-menu-label'))
    assert.equal(label, null) // 折叠时无 label
  })

  it('折叠切换：collapsed 受控回传 onCollapseChange', async () => {
    let got: boolean | undefined
    const vnode = await renderVNode(Menu, {
      items: submenuItems, collapsible: true, collapsed: false,
      onCollapseChange: (c: boolean) => { got = c },
    }, createTestCtx())!
    const collapseBtn = findV(vnode, (n) => n.props?.class?.includes('wf-menu-collapse-btn'))
    assert.ok(collapseBtn, '折叠按钮存在')
    collapseBtn.props.onClick()
    assert.equal(got, true)
  })

  it('折叠态子菜单：点击标题弹出浮层（aria-expanded + popup portal）', async () => {
    const ctx = createTestCtx()
    const render = renderVNode.bind(null, Menu) as any
    const factory = await (Menu as any)({ items: submenuItems, collapsible: true, collapsed: true }, ctx)
    let v = await factory({ items: submenuItems, collapsible: true, collapsed: true })
    // 折叠标题 aria-expanded=false
    const findTitle = (n: any): any => {
      if (!n || typeof n !== 'object') return null
      if (String(n.props?.class ?? '').includes('wf-menu-submenu-title--collapsed')) return n
      const k = n.props?.children
      const arr = Array.isArray(k) ? k : (k && typeof k === 'object' ? [k] : [])
      for (const c of arr) { const f = findTitle(c); if (f) return f }
      return null
    }
    const title = findTitle(v)
    assert.ok(title, '折叠标题渲染')
    assert.equal(title.props['aria-expanded'], 'false', '初始未展开')
    // 点击展开（mock usePopup.portal 返回 content，popupOpen 后 children[1] 非空）
    title.props.onClick({ currentTarget: {} })
    v = await factory({ items: submenuItems, collapsible: true, collapsed: true })
    const title2 = findTitle(v)
    assert.equal(title2.props['aria-expanded'], 'true', '点击后展开')
  })
})
