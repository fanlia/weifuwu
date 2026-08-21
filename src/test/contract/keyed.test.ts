/**
 * vdom core/node — keyed 测试（keyed 列表语义——业务身份声明协议）
 *
 * 锁定规则（设计规则 §4.0/§5.7）：全 keyed 身份映射；全 unkeyed 位置身份；
 * 混合数组 pos:{i} 位置 key（命名空间隔离）；A 级检测 warn 引导。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyOf, isKeyed, listKind, positionKey, isPositionKey,
  identityKey, keyIndex, planKeyedDiff, detectMissingKey,
} from '../../client/vdom/core/node/keyed.ts'
import { h } from '../../client/vdom/core/vnode.ts'

test('keyOf/isKeyed：vnode.key 业务声明——非 vnode 项 = null', () => {
  assert.equal(keyOf(h('div', { key: 'a' })), 'a')
  assert.equal(keyOf(h('div', {})), null)
  assert.equal(keyOf('text'), null)
  assert.equal(keyOf(null), null)
  assert.equal(keyOf([h('span', {})]), null)
  assert.equal(isKeyed(h('div', { key: 'a' })), true)
  assert.equal(isKeyed(h('div', {})), false)
})

test('listKind：全 keyed / 全 unkeyed / 混合', () => {
  assert.equal(listKind([h('div', { key: 'a' }), h('div', { key: 'b' })]), 'all-keyed')
  assert.equal(listKind([h('div', {}), h('div', {})]), 'all-unkeyed')
  assert.equal(listKind([h('div', { key: 'a' }), h('div', {})]), 'mixed')
  assert.equal(listKind([]), 'all-unkeyed')
  assert.equal(listKind(['text', 42]), 'all-unkeyed')
})

test('positionKey：pos:{i} 命名空间隔离（永不与用户 key 冲突）', () => {
  assert.equal(positionKey(0), 'pos:0')
  assert.equal(positionKey(3), 'pos:3')
  assert.equal(isPositionKey('pos:0'), true)
  assert.equal(isPositionKey('a'), false)
})

test('identityKey：keyed 项业务 key——unkeyed 项位置 key（混合数组同一映射）', () => {
  const items = [h('div', { key: 'a' }), h('div', {}), h('div', { key: 'c' })]
  assert.equal(identityKey(items, 0), 'a')
  assert.equal(identityKey(items, 1), 'pos:1', '无 key 项位置接管')
  assert.equal(identityKey(items, 2), 'c')
})

test('keyIndex：key → 索引映射（首现优先）', () => {
  const items = [h('div', { key: 'b' }), h('div', { key: 'a' })]
  const idx = keyIndex(items)
  assert.equal(idx.get('a'), 1)
  assert.equal(idx.get('b'), 0)
  assert.equal(idx.size, 2)
})

test('planKeyedDiff：增/删/复用决策（身份跟随内容）', () => {
  const oldItems = [h('div', { key: 'a' }), h('div', { key: 'b' })]
  const newItems = [h('div', { key: 'b' }), h('div', { key: 'c' })]
  const plan = planKeyedDiff(oldItems, newItems)
  assert.deepEqual(plan.reused.sort(), ['b'], 'b 复用——身份保持')
  assert.deepEqual(plan.removed, ['a'], 'a 移除（不在新列表）')
  assert.deepEqual(plan.added, ['c'], 'c 新建')
})

test('planKeyedDiff：重排全复用（不误判增删）', () => {
  const oldItems = [h('div', { key: 'a' }), h('div', { key: 'b' }), h('div', { key: 'c' })]
  const newItems = [h('div', { key: 'c' }), h('div', { key: 'a' }), h('div', { key: 'b' })]
  const plan = planKeyedDiff(oldItems, newItems)
  assert.equal(plan.reused.length, 3)
  assert.equal(plan.removed.length, 0)
  assert.equal(plan.added.length, 0)
})

test('A 级检测：无 key 组件项 warn 引导（dev）', () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const Comp = () => () => h('span', {})
    detectMissingKey([h(Comp, {}), h(Comp, {})], 'items')
  assert.equal(warns.length, 1, '无 key 组件项 → warn')
  assert.match(warns[0], /key/)
    detectMissingKey([h('div', {}), h('div', {})], 'elements')
  assert.equal(warns.length, 1, '纯元素列表不 warn（位置身份正确）')
    detectMissingKey([h(Comp, { key: 'a' }), h(Comp, { key: 'b' })], 'keyed')
  assert.equal(warns.length, 1, '全 keyed 不 warn')
    detectMissingKey([h(Comp, {})], 'single')
  assert.equal(warns.length, 1, '单子节点不 warn（条件渲染豁免）')
  } finally {
    console.warn = origWarn
  }
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
