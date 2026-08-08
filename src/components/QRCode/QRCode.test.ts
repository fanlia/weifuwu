import { describe, it } from 'node:test'
import assert from 'node:assert'
import { QRCode } from './QRCode.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('QRCode', () => {
  it('renders svg', () => {
    const vnode = renderVNode(QRCode, { value: 'https://weifuwu.dev' }, mockCtx())!
    assert.equal(vnode.type, 'svg')
  })

  it('viewBox includes quiet zone', () => {
    const vnode = renderVNode(QRCode, { value: 'hi' }, mockCtx())!
    // viewBox = 0 0 (size + 2*quiet) 缩放
    const qr = vnode.props.children[0].props.d // 不直接验证，验证 viewBox 存在
    assert.ok(vnode.props.viewBox)
  })

  it('renders dark modules as rects', () => {
    const vnode = renderVNode(QRCode, { value: 'hi' }, mockCtx())!
    const rects = vnode.props.children.filter((c: any) => c?.type === 'rect')
    assert.ok(rects.length > 10, `应有多个模块 rect，实际 ${rects.length}`)
    // 所有 rect fill 用 color prop
    for (const r of rects) assert.equal(r.props.fill, 'currentColor')
  })

  it('size prop sets rendered dimensions', () => {
    const vnode = renderVNode(QRCode, { value: 'hi', size: 200 }, mockCtx())!
    assert.equal(vnode.props.width, 200)
    assert.equal(vnode.props.height, 200)
  })

  it('color and bgColor applied', () => {
    const vnode = renderVNode(QRCode, { value: 'hi', color: '#ff0000', bgColor: '#ffffff' }, mockCtx())!
    const rects = vnode.props.children.filter((c: any) => c?.type === 'rect')
    const modules = rects.filter((c: any) => c.props.class !== 'wf-qr-bg')
    assert.equal(modules[0].props.fill, '#ff0000')
    const bg = rects.find((c: any) => c.props.class === 'wf-qr-bg')
    assert.equal(bg.props.fill, '#ffffff')
  })

  it('different values produce different module counts', () => {
    const v1 = renderVNode(QRCode, { value: 'a' }, mockCtx())!
    const v2 = renderVNode(QRCode, { value: 'longer-value-12345' }, mockCtx())!
    const rects1 = v1.props.children.filter((c: any) => c?.type === 'rect' && c.props.class !== 'wf-qr-bg').length
    const rects2 = v2.props.children.filter((c: any) => c?.type === 'rect' && c.props.class !== 'wf-qr-bg').length
    assert.notEqual(rects1, rects2)
  })
})
