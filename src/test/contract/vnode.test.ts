/**
 * vdom core — vnode 纯数据面测试
 *
 * 锁定 h/jsx 行为契约（vdom-x X-A 系 + AGENTS §4.0）：
 * - h() 除 key 剥离外零转换（children 原样——false/嵌套数组保留）
 * - key 业务身份声明（props 不泄漏 key）
 * - childrenOf 单一规则源（递归展开 + 空洞保留——长度恒定）
 * - 组件两阶段类型（工厂 mount 一次 + renderFn 每次渲染）
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, jsx, type VNode, type Component } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { childrenOf } from '../../client/vdom/core/node/children.ts'

test('h：纯数据 vnode——type/props/key/children 形状', () => {
  const v = h('div', { id: 'x', key: 'k1' }, 'text')
  assert.equal(v.type, 'div')
  assert.equal(v.key, 'k1')
  assert.equal(v.props.id, 'x')
  assert.equal(v.props.key, undefined, 'key 从 props 剥离——组件不见 key')
  assert.equal(v.props.children, 'text')
  assert.deepEqual(Object.keys(v.props).sort(), ['children', 'id'], '除 key 剥离外零转换')
})

test('h：children 原样——false/嵌套数组保留（不 filter）', () => {
  const v = h('div', {}, false, [h('span', {}), [h('i', {})]], null, 0)
  const c = v.props.children as unknown[]
  assert.ok(Array.isArray(c))
  assert.equal(c.length, 4, '多子节点存数组——false/null/0 保留')
  assert.equal(c[0], false)
  assert.equal(c[1][0].type, 'span')
  assert.equal(c[1][1][0].type, 'i', '嵌套数组原样（childrenOf 消费侧展开）')
})

test('childrenOf：递归展开 + 空洞保留（长度恒定——占位法前提）', () => {
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

test('jsx 运行时：React 兼容签名——props.key 与第三参 key 双源', () => {
  const a = jsx('div', { id: 'a' }, 'ka')
  assert.equal(a.key, 'ka')
  const b = jsx('div', { id: 'b', key: 'kb' })
  assert.equal(b.key, 'kb')
  assert.equal(b.props.key, undefined, 'props 内 key 同样剥离')
  const c = jsx(Fragment as unknown as string, { children: [h('span', {})] })
  assert.equal(c.props.children.length, 1)
})

test('组件两阶段类型：工厂 mount 一次 + renderFn 每次渲染', () => {
  const Counter: Component<{ step?: number }, { render: () => Promise<void> }> = (initProps, ctx) => {
    let count = initProps.step ?? 0
    return (props) => h('button', { onClick: () => { count += props.step ?? 1; void ctx.render() } }, `count:${count}`)
  }
  // 形状验证（编译期）——运行时仅验证 h 调用链
  const v = h(Counter, { step: 1 })
  assert.equal(v.type, Counter)
  assert.equal(v.props.step, 1)
})

test('childrenOf：单子节点形态（非数组——h 直接存）', () => {
  const v = h('p', {}, 'single')
  assert.deepEqual(childrenOf(v), ['single'])
  const none = h('p', {})
  assert.deepEqual(childrenOf(none), [], '无 children → 空序列')
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
