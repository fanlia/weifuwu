/**
 * vdom core — vnode 纯数据面测试
 *
 * 锁定 h/jsx 行为契约（vdom-x X-A 系 + AGENTS §4.0）：
 * - h() 除 key 剥离外零转换（children 原样——false/嵌套数组保留）
 * - key 业务身份声明（props 不泄漏 key）
 * - childrenOf 单一规则源（递归展开 + 空洞保留——长度恒定）
 * - 组件两阶段类型（工厂 mount 一次 + renderFn 每次渲染）
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { h, jsx, type VNode, type Component } from './vnode.ts'
import { Fragment } from './node/fragment.ts'
import { childrenOf } from './node/children.ts'

test('h：纯数据 vnode——type/props/key/children 形状', () => {
  const v = h('div', { id: 'x', key: 'k1' }, 'text')
  expect(v.type).toBe('div')
  expect(v.key).toBe('k1')
  expect(v.props.id).toBe('x')
  expect(v.props.key, 'key 从 props 剥离——组件不见 key').toBe(undefined)
  expect(v.props.children).toBe('text')
  expect(Object.keys(v.props).sort(), '除 key 剥离外零转换').toEqual(['children', 'id'])
})

test('h：children 原样——false/嵌套数组保留（不 filter）', () => {
  const v = h('div', {}, false, [h('span', {}), [h('i', {})]], null, 0)
  const c = v.props.children as unknown[]
  expect(Array.isArray(c)).toBeTruthy()
  expect(c.length, '多子节点存数组——false/null/0 保留').toBe(4)
  expect(c[0]).toBe(false)
  expect(c[1][0].type).toBe('span')
  expect(c[1][1][0].type, '嵌套数组原样（childrenOf 消费侧展开）').toBe('i')
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
  expect(c.length, '任意嵌套展开为同一序列——空洞占位保留（span/false/i/null/b/text/0）').toBe(7)
  expect(c[0].type).toBe('span')
  expect(c[1]).toBe(false)
  expect(c[2].type).toBe('i')
  expect(c[3]).toBe(null)
  expect(c[4].type).toBe('b')
  expect(c[5]).toBe('text')
  expect(c[6]).toBe(0)
})

test('jsx 运行时：React 兼容签名——props.key 与第三参 key 双源', () => {
  const a = jsx('div', { id: 'a' }, 'ka')
  expect(a.key).toBe('ka')
  const b = jsx('div', { id: 'b', key: 'kb' })
  expect(b.key).toBe('kb')
  expect(b.props.key, 'props 内 key 同样剥离').toBe(undefined)
  const c = jsx(Fragment as unknown as string, { children: [h('span', {})] })
  expect(c.props.children.length).toBe(1)
})

test('组件两阶段类型：工厂 mount 一次 + renderFn 每次渲染', () => {
  const Counter: Component<{ step?: number }, { render: () => Promise<void> }> = (initProps, ctx) => {
    let count = initProps.step ?? 0
    return (props) => h('button', { onClick: () => { count += props.step ?? 1; void ctx.render() } }, `count:${count}`)
  }
  // 形状验证（编译期）——运行时仅验证 h 调用链
  const v = h(Counter, { step: 1 })
  expect(v.type).toBe(Counter)
  expect(v.props.step).toBe(1)
})

test('childrenOf：单子节点形态（非数组——h 直接存）', () => {
  const v = h('p', {}, 'single')
  expect(childrenOf(v)).toEqual(['single'])
  const none = h('p', {})
  expect(childrenOf(none), '无 children → 空序列').toEqual([])
})
