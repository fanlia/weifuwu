/**
 * createItem 契约——交互元素状态捆绑（原语全面化回馈 #2）
 *
 * 锁定：单活动态 · 类后缀派生 · aria 布尔直传（内核归一）· ariaText 文本值
 * · extra 后置胜 · undefined 移除语义（ariaText）vs false 保留语义（aria）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createItem } from '../../client/vdom/core/create-item.ts'

test('非 active：类无后缀 · aria 布尔 false 保留（≠移除）', () => {
  const item = createItem({ cls: 'wf-tab', role: 'tab', aria: 'aria-selected' })
  assert.deepEqual(item(false), {
    class: 'wf-tab',
    role: 'tab',
    'aria-selected': false,
  })
})

test('active：类带后缀 · aria 布尔 true（内核归一为 "true"）', () => {
  const item = createItem({ cls: 'wf-tab', role: 'tab', aria: 'aria-selected' })
  const p = item(true)
  assert.equal(p.class, 'wf-tab wf-tab--active')
  assert.equal(p['aria-selected'], true)
})

test('suffix 自定义（ToggleGroup --pressed 面部）', () => {
  const item = createItem({ cls: 'wf-toggle', suffix: '--pressed', aria: 'aria-pressed' })
  assert.equal(item(true).class, 'wf-toggle wf-toggle--pressed')
})

test('ariaText：active → 文本值 · 非 active → undefined（移除语义）', () => {
  const item = createItem({ cls: 'wf-anchor-link', ariaText: { key: 'aria-current', value: 'page' } })
  assert.deepEqual(item(true)['aria-current'], 'page')
  assert.equal(item(false)['aria-current'], undefined)
})

test('roving tabindex：active → 0 · 非 active → -1', () => {
  const item = createItem({ cls: 'wf-tab', role: 'tab', aria: 'aria-selected', roving: true })
  assert.equal(item(true).tabindex, 0)
  assert.equal(item(false).tabindex, -1)
})

test('组合：role + aria + extra 后置胜（class 追加语义）', () => {
  const item = createItem({ cls: 'wf-item', role: 'option', aria: 'aria-selected' })
  const p = item(true, { onClick: (() => {}) as any, class: 'wf-item--disabled' })
  assert.equal(p.class, 'wf-item wf-item--active wf-item--disabled' /* class 追加——不覆盖状态类 */)
  assert.equal(p.role, 'option')
  assert.equal(p['aria-selected'], true)
})

test('class 数组 extra（TabBar disabled 面）', () => {
  const item = createItem({ cls: 'wf-tab-bar-item', aria: 'aria-selected', roving: true })
  assert.equal(item(false, { class: ['wf-tab-bar-item--disabled', ''] }).class,
    'wf-tab-bar-item wf-tab-bar-item--disabled')
})

test('无 aria 声明：仅类面（纯样式项）', () => {
  const item = createItem({ cls: 'wf-plain' })
  assert.deepEqual(item(false), { class: 'wf-plain' })
  assert.equal(item(true).class, 'wf-plain wf-plain--active')
})

// ── 多状态槽（回馈 #4）──
test('多槽：active+open 双后缀 + 各自 aria 面', () => {
  const title = createItem({
    cls: 'wf-menu-submenu-title', role: 'menuitem',
    states: { active: { roving: true }, open: { aria: 'aria-expanded' } },
  })
  const p = title({ active: true, open: true })
  assert.equal(p.class, 'wf-menu-submenu-title wf-menu-submenu-title--active wf-menu-submenu-title--open')
  assert.equal(p.tabindex, 0)
  assert.equal(p['aria-expanded'], true)
})

test('多槽：槽假值——aria 布尔 false 保留 · ariaText undefined 移除', () => {
  const title = createItem({
    cls: 'wf-x',
    states: { open: { aria: 'aria-expanded' }, cur: { ariaText: { key: 'aria-current', value: 'page' } } },
  })
  const p = title({ open: false, cur: false })
  assert.equal(p['aria-expanded'], false)
  assert.equal(p['aria-current'], undefined)
  assert.equal(p.class, 'wf-x')
})

test('多槽：suffix false = roving-only 槽（无类面）', () => {
  const item = createItem({ cls: 'wf-y', states: { active: { roving: true, suffix: false } } })
  const p = item({ active: true })
  assert.equal(p.class, 'wf-y')
  assert.equal(p.tabindex, 0)
})

test('多槽：槽名默认后缀（--open 自动派生）', () => {
  const item = createItem({ cls: 'wf-z', states: { open: { aria: 'aria-expanded' } } })
  assert.equal(item({ open: true }).class, 'wf-z wf-z--open')
})

test('多槽：未传入槽键 → false（不激活）', () => {
  const item = createItem({ cls: 'wf-z', states: { open: { aria: 'aria-expanded' } } })
  assert.equal(item({}).class, 'wf-z')
  assert.equal(item({})['aria-expanded'], false)
})
