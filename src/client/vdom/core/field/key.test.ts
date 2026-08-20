/**
 * vdom core — key 字段测试（业务身份声明协议）
 *
 * 锁定规则（AGENTS §4.0/§5.7）：h/jsx 剥离 key 进 vnode.key（props 不泄漏）；
 * key 必须 string|number（其余 warn + null——位置身份）；无 key = 位置身份。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { extractKey, stripKey, KEY } from './key.ts'
import { h, jsx } from '../vnode.ts'

test('extractKey：string/number 有效——number 字符串化', () => {
  expect(extractKey({ key: 'a' })).toBe('a')
  expect(extractKey({ key: 42 })).toBe('42')
  expect(extractKey({ key: null })).toBe(null)
  expect(extractKey({})).toBe(null)
  expect(extractKey(null)).toBe(null)
  expect(extractKey(undefined)).toBe(null)
})

test('extractKey：非法类型 warn + null（位置身份——不静默）', () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
  expect(extractKey({ key: {} as never })).toBe(null)
  expect(extractKey({ key: Symbol('x') as never })).toBe(null)
  expect(extractKey({ key: true as never })).toBe(null)
  } finally {
    console.warn = origWarn
  }
  expect(warns.length, '每个非法 key 一次 warn').toBe(3)
  expect(warns[0], 'warn 明确提示').toMatch(/key/)
})

test('stripKey：拷贝不含 key（props 不泄漏——组件不见 key）', () => {
  const p = stripKey({ key: 'k', id: 'x' })
  expect(p).toEqual({ id: 'x' })
  expect(p.key).toBe(undefined)
})

test('h/jsx 集成：key 剥离进 vnode.key——props 干净', () => {
  const a = h('div', { key: 'k1', id: 'a' })
  expect(a.key).toBe('k1')
  expect(a.props.key).toBe(undefined)
  const b = jsx('div', { key: 'k2', id: 'b' })
  expect(b.key).toBe('k2')
  expect(b.props.key).toBe(undefined)
  const c = h('div', {})
  expect(c.key, '无 key = 位置身份').toBe(null)
  expect(KEY).toBe('key')
})
