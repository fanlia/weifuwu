import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Img } from './Img.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

describe('Img preview 增强', () => {
  // preview 返回 wrap div > [button(img), portal]（单元素可能被 h 展开）
  const wrapChildren = (v: any) => Array.isArray(v.props.children) ? v.props.children : [v.props.children]
  const triggerOf = (v: any) => wrapChildren(v)[0]

  it('renders img normally without preview', () => {
    const vnode = renderVNode(Img, { src: 'a.png' }, mockCtx())!
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, 'a.png')
  })

  it('preview wraps in button trigger', () => {
    const vnode = renderVNode(Img, { src: 'a.png', preview: true }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-img-preview-wrap/)
    const trigger = triggerOf(vnode)
    assert.equal(trigger.type, 'button')
    assert.match(trigger.props.class, /wf-img-preview-trigger/)
    const img = trigger.props.children // 单元素 children 被 h 展开
    assert.equal(img.type, 'img')
    assert.equal(img.props.src, 'a.png')
  })

  it('click trigger opens preview overlay', () => {
    const ctx = mockCtx()
    const render = Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = r({ src: 'a.png', preview: true })
    assert.ok(v.props.children[1], '应显示预览层')
    const overlay = v.props.children[1].props.children
    assert.match(overlay.props.class, /wf-img-preview-overlay/)
    assert.equal(overlay.props.children.props.src, 'a.png')
  })

  it('Escape closes preview', () => {
    const ctx = mockCtx()
    const render = Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = r({ src: 'a.png', preview: true })
    assert.ok(v.props.children[1])
    v.props.onKeyDown({ key: 'Escape' })
    v = r({ src: 'a.png', preview: true })
    assert.equal(v.props.children.length, 1)
  })

  it('click overlay closes preview', () => {
    const ctx = mockCtx()
    const render = Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = r({ src: 'a.png', preview: true })
    const overlay = wrapChildren(v)[1].props.children
    overlay.props.onClick({ target: overlay, currentTarget: overlay })
    v = r({ src: 'a.png', preview: true })
    assert.equal(wrapChildren(v).length, 1)
  })

  it('fallback still works with preview', () => {
    const vnode = renderVNode(Img, { src: 'broken.png', fallback: 'fallback.png', preview: true }, mockCtx())!
    const img = triggerOf(vnode).props.children
    assert.equal(typeof img.props.onError, 'function')
  })
})
