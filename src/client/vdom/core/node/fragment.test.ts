/**
 * vdom core — fragment 测试
 *
 * 锁定规则（AGENTS §4.0）：Fragment 内部符号（公共面不导出）；数组 = 隐式
 * Fragment（childrenOf 递归展开——单一规则源——空洞保留——长度恒定——
 * 路径按展开后位置）；Fragment 符号 vnode 与数组同义。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { Fragment, isFragment } from './fragment.ts'
import { childrenOf } from './children.ts'
import { h } from '../vnode.ts'

test('Fragment 内部符号：isFragment 判定', () => {
  const f = h(Fragment as unknown as string, {}, h('span', {}))
  expect(isFragment(f)).toBe(true)
  expect(isFragment(h('div', {}))).toBe(false)
  expect(typeof Fragment === 'symbol', '符号形态——不可序列化冲突').toBeTruthy()
})

test('Fragment 符号 vnode 与数组同义（展开为同一序列）', () => {
  const frag = h(Fragment as unknown as string, {}, [
    h('span', {}, 'a'),
    false,
    h('i', {}, 'b'),
  ])
  const cs = childrenOf(frag)
  expect(cs.length).toBe(3)
  expect((cs[0] as VNode).type).toBe('span')
  expect(cs[1], '空洞保留').toBe(false)
  expect((cs[2] as VNode).type).toBe('i')
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
  expect(c.length, '任意嵌套展开为同一序列——空洞占位保留（span/false/i/null/b/text/0）').toBe(7)
  expect(c[0].type).toBe('span')
  expect(c[1]).toBe(false)
  expect(c[2].type).toBe('i')
  expect(c[3]).toBe(null)
  expect(c[4].type).toBe('b')
  expect(c[5]).toBe('text')
  expect(c[6]).toBe(0)
})

test('childrenOf 单子节点/无子节点形态', () => {
  expect(childrenOf(h('p', {}, 'single'))).toEqual(['single'])
  expect(childrenOf(h('p', {}))).toEqual([])
})
