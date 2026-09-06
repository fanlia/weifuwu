/**
 * vdom 内核契约——class 归一化（normalizeClass + h/jsx 自动归一）
 *
 * 设计（2027-09——组件层 105 文件 180 处模板拼接手搓实证——万库通用形态
 * 内核承载：字符串直通零成本 · 对象/数组归一空格串）：
 * - 字符串直通（现状兼容——零行为变化）
 * - 数组展开（含嵌套/条件 false 剔除）
 * - 对象条件真值（{ 'wf-active': flag }——true 键入选）
 * - false/null/undefined → 无 class（不进 attrs）
 * - h/jsx 自动归一（仅非字符串时处理——含 className 别名）
 * - 归一后进命令流 attrs（协议面字符串——SSR/diff 零改）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, jsx, normalizeClass } from '../../client/vdom/index.ts'

test('normalizeClass：字符串直通（现状零成本）', () => {
  assert.equal(normalizeClass('wf-btn wf-btn--sm'), 'wf-btn wf-btn--sm')
  assert.equal(normalizeClass(''), undefined, '空串 → undefined')
  assert.equal(normalizeClass(null), undefined)
  assert.equal(normalizeClass(undefined), undefined)
  assert.equal(normalizeClass(false), undefined)
})

test('normalizeClass：数组展开（嵌套 + 条件 false 剔除）', () => {
  assert.equal(normalizeClass(['wf-a', 'wf-b']), 'wf-a wf-b')
  assert.equal(normalizeClass(['wf-a', false, 'wf-b']), 'wf-a wf-b')
  assert.equal(normalizeClass(['wf-a', null, undefined]), 'wf-a')
  assert.equal(normalizeClass([['wf-a', ['wf-b']]]), 'wf-a wf-b', '嵌套递归')
  assert.equal(normalizeClass([]), undefined)
})

test('normalizeClass：对象条件真值（{ class: flag }）', () => {
  assert.equal(normalizeClass({ 'wf-active': true, 'wf-hidden': false }), 'wf-active')
  assert.equal(normalizeClass({ 'wf-a': 1, 'wf-b': 0 }), 'wf-a', '真值语义（非空即真）')
  assert.equal(normalizeClass({ 'wf-x': 'yes' }), 'wf-x')
})

test('h() 自动归一：对象 class → 命令流 attrs 字符串', async () => {
  const { mount, createTable } = await import('../../test/contract/component-harness.ts')
  const t = { mount, createTable } as any
  const Comp: any = () => () => h('div', { class: { 'wf-active': true, 'wf-off': false } })
  const hh = await t.mount(Comp, {})
  const ct = t.createTable(hh.cmds)
  const div = [...ct.values()].find((c: any) => c.tag === 'div')
  assert.equal(String(div.attrs?.class ?? ''), 'wf-active')
})

test('h() 数组 class → attrs 字符串（条件组合）', async () => {
  const { mount, createTable } = await import('../../test/contract/component-harness.ts')
  const t = { mount, createTable } as any
  const active = true
  const Comp: any = () => () => h('span', { class: ['wf-item', active && 'wf-item--active'] })
  const hh = await t.mount(Comp, {})
  const ct = t.createTable(hh.cmds)
  const span = [...ct.values()].find((c: any) => c.tag === 'span')
  assert.equal(String(span.attrs?.class ?? ''), 'wf-item wf-item--active')
})

test('className 别名同样归一（attrs 层 class 映射先例）', () => {
  const v = jsx('div', { className: { 'wf-x': true } })
  assert.equal(String(v.props.className), 'wf-x', 'jsx 归一 className')
})

test('字符串直通不改（h 现状行为——老组件零感知）', () => {
  const v = h('div', { class: 'wf-btn wf-btn--sm' })
  assert.equal(v.props.class, 'wf-btn wf-btn--sm')
})
