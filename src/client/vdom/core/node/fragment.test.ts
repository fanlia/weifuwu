/**
 * vdom core — fragment 测试
 *
 * 锁定规则（AGENTS §4.0）：Fragment 内部符号（公共面不导出）；数组 = 隐式
 * Fragment（childrenOf 递归展开——单一规则源——空洞保留——长度恒定——
 * 路径按展开后位置）；Fragment 符号 vnode 与数组同义。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Fragment, isFragment } from './fragment.ts'
import { childrenOf } from './children.ts'
import { h } from '../vnode.ts'

test('Fragment 内部符号：isFragment 判定', () => {
  const f = h(Fragment as unknown as string, {}, h('span', {}))
  assert.equal(isFragment(f), true)
  assert.equal(isFragment(h('div', {})), false)
  assert.ok(typeof Fragment === 'symbol', '符号形态——不可序列化冲突')
})

test('Fragment 符号 vnode 与数组同义（展开为同一序列）', () => {
  const frag = h(Fragment as unknown as string, {}, [
    h('span', {}, 'a'),
    false,
    h('i', {}, 'b'),
  ])
  const cs = childrenOf(frag)
  assert.equal(cs.length, 3)
  assert.equal((cs[0] as VNode).type, 'span')
  assert.equal(cs[1], false, '空洞保留')
  assert.equal((cs[2] as VNode).type, 'i')
})

test('childrenOf 递归展开 + 空洞保留（长度恒定——占位法前提）', () => {
  const v = h('div', {}, [
    h('span', {}),
    false,
    [h('i', {}), null, [h('b', {})]],
    'text',
    0,
  ])
  const c = childrenOf(v)
  assert.equal(c.length, 7, '任意嵌套展开为同一序列——空洞占位保留（span/false/i/null/b/text/0）')
  assert.equal(c[0].type, 'span')
  assert.equal(c[1], false)
  assert.equal(c[2].type, 'i')
  assert.equal(c[3], null)
  assert.equal(c[4].type, 'b')
  assert.equal(c[5], 'text')
  assert.equal(c[6], 0)
})

test('childrenOf 单子节点/无子节点形态', () => {
  assert.deepEqual(childrenOf(h('p', {}, 'single')), ['single'])
  assert.deepEqual(childrenOf(h('p', {})), [])
})
