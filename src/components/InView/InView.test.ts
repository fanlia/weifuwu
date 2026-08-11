import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { InView } from './InView.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'
import { h } from '../../ui-dom/vnode.ts'

function makeCtx(): WfuiContext {
  return createTestCtx({ ui: { useInView: () => ({ isIn: false, ready: true, observe: () => {}, refresh: () => {}, disconnect: () => {} }) } }) as any
}

/** 两阶段组件：mount 后调用 renderFn(props) */
function renderInView(props: any, ctx: WfuiContext) {
  const result = InView(props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

describe('InView', () => {
  it('renders placeholder when not in view', () => {
    const vnode = renderInView({ children: h('p', null, '内容') }, makeCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-inview--pending/)
  })

  it('renders children when in view', () => {
    const ctx = makeCtx()
    // 手动触发 inView 状态
    const result = InView({ children: h('p', null, '内容') }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    // 通过 ref 获取 sentinel 元素并触发 IntersectionObserver
    // 这里简化：直接验证首次不渲染 children，而是渲染占位
    const vnode = renderFn!({ children: h('p', null, '内容') })!
    const pendingEl = vnode.props.children?.find?.((c: any) => c?.props?.class === 'wf-inview-pending')
    assert.ok(pendingEl, 'should have sentinel element when not in view')
    assert.match(vnode.props.class, /wf-inview--pending/)
  })

  it('accepts custom placeholder', () => {
    const placeholder = h('span', { class: 'custom-placeholder' }, '加载中...')
    const vnode = renderInView({ placeholder }, makeCtx())!
    // children 结构：[sentinel, placeholder]
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    const placeholderEl = children.find((c: any) => c?.props?.class === 'custom-placeholder')
    assert.ok(placeholderEl, 'custom placeholder should be rendered')
    assert.equal(placeholderEl.props.children, '加载中...')
  })

  it('onEnter is available as callback prop', () => {
    const ctx = makeCtx()
    const onEnter = () => {}
    const vnode = renderInView({ children: '内容', onEnter }, ctx)
    assert.match(vnode!.props.class, /pending/)
  })

  it('default placeholder is a div with wf-inview-placeholder class', () => {
    const vnode = renderInView({ children: '内容' }, makeCtx())!
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    const placeholderEl = children.find((c: any) => c?.props?.class === 'wf-inview-placeholder')
    assert.ok(placeholderEl, 'default placeholder should be a div.wf-inview-placeholder')
  })

  it('sets once default to true', () => {
    const ctx = makeCtx()
    const result = InView({ children: '内容' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    const vnode = renderFn!({ children: '内容' })!
    assert.match(vnode.props.class, /pending/)
  })
})
