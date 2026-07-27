import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { InView } from './InView.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('InView', () => {
  it('renders placeholder when not in view', () => {
    const vnode = InView({ children: h('p', null, '内容') }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-inview--pending/)
  })

  it('renders children when in view', () => {
    const ctx = mockCtx()
    ctx.ui.$.inView = true
    const vnode = InView({ children: h('p', null, '内容') }, ctx)!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-inview--loaded/)
  })

  it('accepts custom placeholder', () => {
    const placeholder = h('span', { class: 'custom-placeholder' }, '加载中...')
    const vnode = InView({ placeholder }, mockCtx())!
    const child = vnode.props.children
    assert.equal(child.type, 'span')
    assert.equal(child.props.class, 'custom-placeholder')
    assert.equal(child.props.children, '加载中...')
  })

  it('onEnter is available as callback prop', () => {
    // onEnter 作为 prop 传入，由 IntersectionObserver 回调调用
    // 此处验证 prop 可正常传递（运行时由 ref 触发）
    const ctx = mockCtx()
    const onEnter = () => {}
    const vnode = InView({ children: '内容', onEnter }, ctx)
    // 未进入视窗时 onEnter 不会被调用
    assert.match(vnode!.props.class, /pending/)
  })

  it('default placeholder is a div with wf-inview-placeholder class', () => {
    const vnode = InView({ children: '内容' }, mockCtx())!
    const child = vnode.props.children
    assert.equal(child.type, 'div')
    assert.equal(child.props.class, 'wf-inview-placeholder')
  })

  it('sets once default to true', () => {
    // 默认 once=true，一旦 inView 就不回退
    const ctx1 = mockCtx()
    ctx1.ui.$.inView = true
    const vnode1 = InView({ children: '内容' }, ctx1)
    assert.match(vnode1!.props.class, /loaded/)

    const ctx2 = mockCtx()
    // once=false 的场景：状态由 ref 管理，此处只验证 once 传参
    const vnode2 = InView({ once: false, children: '内容' }, ctx2)
    assert.match(vnode2!.props.class, /pending/)
  })
})
