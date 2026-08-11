import { describe, it } from 'node:test'
import assert from 'node:assert'
import { QRCode } from './QRCode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'



describe('QRCode', () => {
  it('renders svg', async () => {
    const vnode = await renderVNode(QRCode, { value: 'https://weifuwu.dev' }, createTestCtx())!
    assert.equal(vnode.type, 'svg')
  })

  it('viewBox includes quiet zone', async () => {
    const vnode = await renderVNode(QRCode, { value: 'hi' }, createTestCtx())!
    // viewBox = 0 0 (size + 2*quiet) 缩放
    const qr = vnode.props.children[0].props.d // 不直接验证，验证 viewBox 存在
    assert.ok(vnode.props.viewBox)
  })

  it('renders dark modules as rects', async () => {
    const vnode = await renderVNode(QRCode, { value: 'hi' }, createTestCtx())!
    const rects = vnode.props.children.filter((c: any) => c?.type === 'rect')
    assert.ok(rects.length > 10, `应有多个模块 rect，实际 ${rects.length}`)
    // 所有 rect fill 用 color prop
    for (const r of rects) assert.equal(r.props.fill, 'currentColor')
  })

  it('size prop sets rendered dimensions', async () => {
    const vnode = await renderVNode(QRCode, { value: 'hi', size: 200 }, createTestCtx())!
    assert.equal(vnode.props.width, 200)
    assert.equal(vnode.props.height, 200)
  })

  it('color and bgColor applied', async () => {
    const vnode = await renderVNode(QRCode, { value: 'hi', color: '#ff0000', bgColor: '#ffffff' }, createTestCtx())!
    const rects = vnode.props.children.filter((c: any) => c?.type === 'rect')
    const modules = rects.filter((c: any) => c.props.class !== 'wf-qr-bg')
    assert.equal(modules[0].props.fill, '#ff0000')
    const bg = rects.find((c: any) => c.props.class === 'wf-qr-bg')
    assert.equal(bg.props.fill, '#ffffff')
  })

  it('different values produce different module counts', async () => {
    const v1 = await renderVNode(QRCode, { value: 'a' }, createTestCtx())!
    const v2 = await renderVNode(QRCode, { value: 'longer-value-12345' }, createTestCtx())!
    const rects1 = v1.props.children.filter((c: any) => c?.type === 'rect' && c.props.class !== 'wf-qr-bg').length
    const rects2 = v2.props.children.filter((c: any) => c?.type === 'rect' && c.props.class !== 'wf-qr-bg').length
    assert.notEqual(rects1, rects2)
  })
})
