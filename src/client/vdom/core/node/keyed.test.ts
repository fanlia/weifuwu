/**
 * vdom core/node — keyed 测试（keyed 列表语义——业务身份声明协议）
 *
 * 锁定规则（AGENTS §4.0/§5.7）：全 keyed 身份映射；全 unkeyed 位置身份；
 * 混合数组 pos:{i} 位置 key（命名空间隔离）；A 级检测 warn 引导。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import {
  keyOf, isKeyed, listKind, positionKey, isPositionKey,
  identityKey, keyIndex, planKeyedDiff, detectMissingKey,
} from './keyed.ts'
import { h } from '../vnode.ts'

test('keyOf/isKeyed：vnode.key 业务声明——非 vnode 项 = null', () => {
  expect(keyOf(h('div', { key: 'a' }))).toBe('a')
  expect(keyOf(h('div', {}))).toBe(null)
  expect(keyOf('text')).toBe(null)
  expect(keyOf(null)).toBe(null)
  expect(keyOf([h('span', {})])).toBe(null)
  expect(isKeyed(h('div', { key: 'a' }))).toBe(true)
  expect(isKeyed(h('div', {}))).toBe(false)
})

test('listKind：全 keyed / 全 unkeyed / 混合', () => {
  expect(listKind([h('div', { key: 'a' }), h('div', { key: 'b' })])).toBe('all-keyed')
  expect(listKind([h('div', {}), h('div', {})])).toBe('all-unkeyed')
  expect(listKind([h('div', { key: 'a' }), h('div', {})])).toBe('mixed')
  expect(listKind([])).toBe('all-unkeyed')
  expect(listKind(['text', 42])).toBe('all-unkeyed')
})

test('positionKey：pos:{i} 命名空间隔离（永不与用户 key 冲突）', () => {
  expect(positionKey(0)).toBe('pos:0')
  expect(positionKey(3)).toBe('pos:3')
  expect(isPositionKey('pos:0')).toBe(true)
  expect(isPositionKey('a')).toBe(false)
})

test('identityKey：keyed 项业务 key——unkeyed 项位置 key（混合数组同一映射）', () => {
  const items = [h('div', { key: 'a' }), h('div', {}), h('div', { key: 'c' })]
  expect(identityKey(items, 0)).toBe('a')
  expect(identityKey(items, 1), '无 key 项位置接管').toBe('pos:1')
  expect(identityKey(items, 2)).toBe('c')
})

test('keyIndex：key → 索引映射（首现优先）', () => {
  const items = [h('div', { key: 'b' }), h('div', { key: 'a' })]
  const idx = keyIndex(items)
  expect(idx.get('a')).toBe(1)
  expect(idx.get('b')).toBe(0)
  expect(idx.size).toBe(2)
})

test('planKeyedDiff：增/删/复用决策（身份跟随内容）', () => {
  const oldItems = [h('div', { key: 'a' }), h('div', { key: 'b' })]
  const newItems = [h('div', { key: 'b' }), h('div', { key: 'c' })]
  const plan = planKeyedDiff(oldItems, newItems)
  expect(plan.reused.sort(), 'b 复用——身份保持').toEqual(['b'])
  expect(plan.removed, 'a 移除（不在新列表）').toEqual(['a'])
  expect(plan.added, 'c 新建').toEqual(['c'])
})

test('planKeyedDiff：重排全复用（不误判增删）', () => {
  const oldItems = [h('div', { key: 'a' }), h('div', { key: 'b' }), h('div', { key: 'c' })]
  const newItems = [h('div', { key: 'c' }), h('div', { key: 'a' }), h('div', { key: 'b' })]
  const plan = planKeyedDiff(oldItems, newItems)
  expect(plan.reused.length).toBe(3)
  expect(plan.removed.length).toBe(0)
  expect(plan.added.length).toBe(0)
})

test('A 级检测：无 key 组件项 warn 引导（dev）', () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const Comp = () => () => h('span', {})
    detectMissingKey([h(Comp, {}), h(Comp, {})], 'items')
  expect(warns.length, '无 key 组件项 → warn').toBe(1)
  expect(warns[0]).toMatch(/key/)
    detectMissingKey([h('div', {}), h('div', {})], 'elements')
  expect(warns.length, '纯元素列表不 warn（位置身份正确）').toBe(1)
    detectMissingKey([h(Comp, { key: 'a' }), h(Comp, { key: 'b' })], 'keyed')
  expect(warns.length, '全 keyed 不 warn').toBe(1)
    detectMissingKey([h(Comp, {})], 'single')
  expect(warns.length, '单子节点不 warn（条件渲染豁免）').toBe(1)
  } finally {
    console.warn = origWarn
  }
})
