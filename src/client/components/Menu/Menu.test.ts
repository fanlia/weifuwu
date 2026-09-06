/**
 * Menu 组件契约测试——badge 面（导航计数徽标）
 *
 * 锁定（入库 W2）：
 * - badge 数字 → Badge count 胶囊（99+ 溢出面组件内建）
 * - badge 字符串 → 原样胶囊
 * - 无 badge → 无徽标节点（零渲染）
 * - 折叠态（collapsible）→ badge 不渲染（icon-only）
 * - badge 不进 attrs（事件/值面契约）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Menu } from './Menu.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

const ITEMS = [
  { key: '/a', label: 'A' },
  { key: '/b', label: 'B', badge: 3 },
  { key: '/c', label: 'C', badge: '新' },
]

test('badge 数字 → Badge count 胶囊渲染', async () => {
  const h = await mount(Menu, { items: ITEMS, activeKey: '/a' })
  const ct = createTable(h.cmds)
  const badge = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-menu-badge'))
  assert.ok(badge, 'badge 容器存在')
  const countEl = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-badge') && String(c.attrs?.class ?? '').includes('count'))
  assert.ok(countEl, 'Badge count 胶囊')
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('3'), '数字文本')
})

test('badge 字符串 → 原样胶囊', async () => {
  const h = await mount(Menu, { items: ITEMS, activeKey: '/a' })
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('新'), '字符串文本')
})

test('无 badge → 无徽标节点（零渲染）', async () => {
  const h = await mount(Menu, { items: [{ key: '/a', label: 'A' }], activeKey: '/a' })
  const ct = createTable(h.cmds)
  const badge = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-menu-badge'))
  assert.equal(badge, undefined, '无 badge 节点')
})

test('折叠态（collapsible + collapsed）→ badge 不渲染（icon-only）', async () => {
  const h = await mount(Menu, { items: ITEMS, activeKey: '/a', collapsible: true, collapsed: true })
  const ct = createTable(h.cmds)
  const badge = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-menu-badge'))
  assert.equal(badge, undefined, '折叠态无 badge')
})

test('badge 不进 attrs（组件数据面契约）', async () => {
  const h = await mount(Menu, { items: ITEMS, activeKey: '/a' })
  const ct = createTable(h.cmds)
  for (const c of ct.values()) {
    assert.equal((c.attrs as any)?.badge, undefined, 'badge 不进 attrs')
  }
})
