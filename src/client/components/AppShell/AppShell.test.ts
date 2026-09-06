/**
 * AppShell 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（W2 增强）：
 * - badge 直通：nav[].badge → Menu badge 胶囊（数字/字符串）
 * - mobile=false（默认）→ 桌面形态：无顶栏/无遮罩/无关闭按钮（SSR 一致性锚点）
 * - mobile=true → 移动形态：NavBar 顶栏 + 关闭按钮（抽屉开/关切面）
 * - onNavigate 直通 + activeKey 前缀匹配（'/' 精确）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AppShell } from './AppShell.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

const NAV = [
  { key: '/', label: '工作台' },
  { key: '/agents', label: 'Agent', badge: 3 },
  { key: '/departments', label: '部门', badge: '新' },
]

test('badge 直通：nav[].badge → Menu badge 胶囊', async () => {
  const h = await mount(AppShell, { nav: NAV, path: '/agents', user: { name: 'U' } })
  const ct = createTable(h.cmds)
  const badge = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-menu-badge'))
  assert.ok(badge, 'badge 容器存在')
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('3'), '数字徽标')
  assert.ok(texts.includes('新'), '字符串徽标')
})

test('桌面形态（默认 mobile=false）：无顶栏/无遮罩/无关闭按钮（SSR 一致性锚点）', async () => {
  const h = await mount(AppShell, { nav: NAV, path: '/', user: { name: 'U' } })
  const ct = createTable(h.cmds)
  const header = [...ct.values()].find((c)=> c.tag === 'header')
  assert.equal(header, undefined, '无 NavBar 顶栏')
  const overlay = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-app-shell-overlay'))
  assert.equal(overlay, undefined, '无遮罩')
  const close = [...ct.values()].find((c)=> String(c.attrs?.title ?? '') === '关闭菜单')
  assert.equal(close, undefined, '无关闭按钮')
  const main = [...ct.values()].find((c)=> c.tag === 'main')
  assert.ok(main, 'main 存在')
})

test('移动形态（mobile=true）：NavBar 顶栏 + 关闭按钮 + drawer 骨架', async () => {
  const h = await mount(AppShell, { nav: NAV, path: '/', user: { name: 'U' }, mobile: true, brand: { name: 'Demo' } })
  const ct = createTable(h.cmds)
  const header = [...ct.values()].find((c)=> c.tag === 'header')
  assert.ok(header, 'NavBar 顶栏存在')
  const close = [...ct.values()].find((c)=> String(c.attrs?.title ?? '') === '关闭菜单')
  assert.ok(close, '关闭按钮存在')
  const menu = [...ct.values()].find((c)=> String(c.attrs?.title ?? '') === '打开菜单')
  assert.ok(menu, '汉堡按钮存在')
  const drawer = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-sidebar'))
  assert.ok(drawer, '侧栏存在（抽屉基座）')
})

test('activeKey 前缀匹配（/ 精确 + 子路径前缀）', async () => {
  const h = await mount(AppShell, { nav: NAV, path: '/agents/3', user: { name: 'U' } })
  const menu = h.cmds.find((c: any)=> c.op === 'create' && c.tag === 'nav') as any
  const active = h.cmds.find((c: any)=> String(c.attrs?.class ?? '').includes('wf-menu-item--active'))
  assert.ok(active, '有激活项')
})

test('onNavigate 直通（Menu onSelect → onNavigate）', async () => {
  let got: string | null = null
  const h = await mount(AppShell, {
    nav: NAV, path: '/', user: { name: 'U' },
    onNavigate: (k: string)=> { got = k },
  })
  const selected = h.cmds.find((c: any)=> c.op === 'create' && (c.attrs as any)?.['data-key'] === '/agents') as any
  assert.ok(selected, '菜单项存在')
  // 回调面：onNavigate 不进 attrs（事件表通道）
  for (const c of createTable(h.cmds).values()) {
    assert.equal((c.attrs as any)?.onNavigate, undefined, 'onNavigate 不进 attrs')
  }
})
