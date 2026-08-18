/**
 * vdom core — key 字段测试（业务身份声明协议）
 *
 * 锁定规则（AGENTS §4.0/§5.7）：h/jsx 剥离 key 进 vnode.key（props 不泄漏）；
 * key 必须 string|number（其余 warn + null——位置身份）；无 key = 位置身份。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractKey, stripKey, KEY } from './key.ts'
import { h, jsx } from '../vnode.ts'

test('extractKey：string/number 有效——number 字符串化', () => {
  assert.equal(extractKey({ key: 'a' }), 'a')
  assert.equal(extractKey({ key: 42 }), '42')
  assert.equal(extractKey({ key: null }), null)
  assert.equal(extractKey({}), null)
  assert.equal(extractKey(null), null)
  assert.equal(extractKey(undefined), null)
})

test('extractKey：非法类型 warn + null（位置身份——不静默）', () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    assert.equal(extractKey({ key: {} as never }), null)
    assert.equal(extractKey({ key: Symbol('x') as never }), null)
    assert.equal(extractKey({ key: true as never }), null)
  } finally {
    console.warn = origWarn
  }
  assert.equal(warns.length, 3, '每个非法 key 一次 warn')
  assert.match(warns[0], /key/, 'warn 明确提示')
})

test('stripKey：拷贝不含 key（props 不泄漏——组件不见 key）', () => {
  const p = stripKey({ key: 'k', id: 'x' })
  assert.deepEqual(p, { id: 'x' })
  assert.equal(p.key, undefined)
})

test('h/jsx 集成：key 剥离进 vnode.key——props 干净', () => {
  const a = h('div', { key: 'k1', id: 'a' })
  assert.equal(a.key, 'k1')
  assert.equal(a.props.key, undefined)
  const b = jsx('div', { key: 'k2', id: 'b' })
  assert.equal(b.key, 'k2')
  assert.equal(b.props.key, undefined)
  const c = h('div', {})
  assert.equal(c.key, null, '无 key = 位置身份')
  assert.equal(KEY, 'key')
})
