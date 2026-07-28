import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { InView } from './InView.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

/** 两阶段组件：mount 后调用 renderFn(props) */
function renderInView(props: any, ctx: WfuiContext) {
  const result = InView(props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

describe('InView', () => {
  it('renders placeholder when not in view', () => {
    const vnode = renderInView({ children: h('p', null, '内容') }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-inview--pending/)
  })

  it('renders children when in view', () => {
    const ctx = mockCtx()
    // mount
    const result = InView({ children: h('p', null, '内容') }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    // set in view state
    ctx.ui.$.inView = true
    const vnode = renderFn!({ children: h('p', null, '内容') })!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-inview--loaded/)
  })

  it('accepts custom placeholder', () => {
    const placeholder = h('span', { class: 'custom-placeholder' }, '加载中...')
    const vnode = renderInView({ placeholder }, mockCtx())!
    const child = vnode.props.children
    assert.equal(child.type, 'span')
    assert.equal(child.props.class, 'custom-placeholder')
    assert.equal(child.props.children, '加载中...')
  })

  it('onEnter is available as callback prop', () => {
    const ctx = mockCtx()
    const onEnter = () => {}
    const vnode = renderInView({ children: '内容', onEnter }, ctx)
    assert.match(vnode!.props.class, /pending/)
  })

  it('default placeholder is a div with wf-inview-placeholder class', () => {
    const vnode = renderInView({ children: '内容' }, mockCtx())!
    const child = vnode.props.children
    assert.equal(child.type, 'div')
    assert.equal(child.props.class, 'wf-inview-placeholder')
  })

  it('sets once default to true', () => {
    const ctx1 = mockCtx()
    const result1 = InView({ children: '内容' }, ctx1)
    const renderFn1 = typeof result1 === 'function' ? result1 : null
    ctx1.ui.$.inView = true
    const vnode1 = renderFn1!({ children: '内容' })!
    assert.match(vnode1.props.class, /loaded/)

    const ctx2 = mockCtx()
    const vnode2 = renderInView({ once: false, children: '内容' }, ctx2)!
    assert.match(vnode2.props.class, /pending/)
  })
})
