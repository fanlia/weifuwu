/**
 * weifuwu/client VNode 类型与工厂函数测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { jsx, jsxs, jsxDEV, h, Fragment } from '../../client/vnode.ts'
import type { VNode, Component, WfuiContext } from '../../client/vnode.ts'

describe('jsx', () => {
  it('创建原生元素 VNode', () => {
    const v = jsx('div', { class: 'foo' })
    assert.equal(v.type, 'div')
    assert.equal(v.props.class, 'foo')
  })

  it('children 在 props 中', () => {
    const v = jsx('div', { children: 'hello' })
    assert.equal(v.props.children, 'hello')
  })

  it('多个子节点', () => {
    const v = jsxs('div', { children: [jsx('span', null), jsx('span', null)] })
    assert.equal(v.props.children.length, 2)
  })

  it('key 不混入 props', () => {
    const v = jsx('li', { class: 'item' }, 'my-key')
    assert.equal(v.key, 'my-key')
    assert.equal(v.props.key, undefined)
  })

  it('Fragment', () => {
    const v = jsx(Fragment, { children: [jsx('div', null), jsx('span', null)] })
    assert.equal(v.type, Fragment)
  })

  it('h 是 jsx 别名', () => {
    assert.deepEqual(h('div', null), jsx('div', null))
  })

  it('props 为 null 时安全', () => {
    const v = jsx('div', null)
    assert.deepEqual(v.props, {})
  })

  it('children 为 undefined 时 props 为空', () => {
    const v = jsx('div', undefined)
    assert.deepEqual(v.props, {})
  })

  it('VNode 属性完整', () => {
    const v = jsx('div', { id: 'x', children: 'text' }, 'k1')
    assert.equal(v.type, 'div')
    assert.equal(v.props.id, 'x')
    assert.equal(v.props.children, 'text')
    assert.equal(v.key, 'k1')
  })

  it('children 为单个字符串', () => {
    const v = jsx('p', { children: 'hello' })
    assert.equal(v.props.children, 'hello')
  })

  it('children 为数组', () => {
    const v = jsxs('ul', { children: [jsx('li', null), jsx('li', null)] })
    assert.equal(Array.isArray(v.props.children), true)
    assert.equal(v.props.children.length, 2)
  })

  it('Fragment 的 type 是 Symbol', () => {
    const v = jsx(Fragment, { children: 'text' })
    assert.equal(v.type, Fragment)
    assert.equal(typeof v.type, 'symbol')
  })
})

describe('jsxs / jsxDEV', () => {
  it('与 jsx 一致', () => {
    assert.deepEqual(jsxs('div', { children: [] }), jsx('div', { children: [] }))
    assert.deepEqual(jsxDEV('div', { children: 'hi' }, null), jsx('div', { children: 'hi' }))
  })
})

describe('Component 类型', () => {
  it('组件返回 VNode', () => {
    const Greeting: Component<{ name: string }> = (props) =>
      jsx('div', { children: `Hello, ${props.name}` })
    const v = Greeting({ name: 'Alice' }, {} as WfuiContext)
    assert.equal(v.type, 'div')
    assert.equal(v.props.children, 'Hello, Alice')
  })

  it('组件返回 null', () => {
    const Empty: Component = () => null
    assert.equal(Empty({}, {} as WfuiContext), null)
  })

  it('组件接收 ctx', () => {
    let capturedCtx: any = null
    const CtxReader: Component = (_props, ctx) => {
      capturedCtx = ctx
      return jsx('div', null)
    }
    const ctx = { someKey: 'value' } as any
    CtxReader({}, ctx)
    assert.equal(capturedCtx, ctx)
  })

  it('组件返回数组（Fragment 语法糖）', () => {
    const Multi: Component = () => [jsx('div', { children: 'a' }), jsx('div', { children: 'b' })] as any
    const v = Multi({}, {} as WfuiContext)
    assert.equal(Array.isArray(v), true)
    assert.equal(v[0].props.children, 'a')
  })

  it('组件返回布尔值', () => {
    const Conditional: Component = () => false as any
    assert.equal(Conditional({}, {} as WfuiContext), false)
  })
})

describe('h 函数', () => {
  it('与 jsx 等价', () => {
    assert.deepEqual(h('div', { class: 'a' }), jsx('div', { class: 'a' }))
  })
})

describe('VNode 结构', () => {
  it('type, props, key 都存在', () => {
    const v = jsx('div', { children: 'x' }, 'key1')
    assert.equal(typeof v.type, 'string')
    assert.equal(typeof v.props, 'object')
    assert.equal(v.key, 'key1')
  })

  it('无 key 时为 undefined', () => {
    const v = jsx('div', { children: 'x' })
    assert.equal(v.key, undefined)
  })
})
