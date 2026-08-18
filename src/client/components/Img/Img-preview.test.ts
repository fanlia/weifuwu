import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Img } from './Img.ts'
import { renderVNode, mountToDom, patchToDom, createPopupMock } from '../../ui-dom/testing.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function mockCtx(){
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    // usePopup mask 模式统一（createPopupMock：open getter + setOpen 转发 + portal 条件渲染）
    usePopup: (opts: any) => createPopupMock(() => opts.isOpen(), opts.setOpen),
  } } as any
}


describe('Img preview 增强', () => {
  // preview 返回 wrap div > [button(img), portal]（单元素可能被 h 展开）
  const wrapChildren = (v: any) => Array.isArray(v.props.children) ? v.props.children : [v.props.children]
  const triggerOf = (v: any) => wrapChildren(v)[0]

  it('renders img normally without preview', async () => {
    const vnode = (await renderVNode(Img, { src: 'a.png' }, mockCtx())) as any
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, 'a.png')
  })

  it('preview wraps in button trigger', async () => {
    const vnode = await renderVNode(Img, { src: 'a.png', preview: true }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-img-preview-wrap/)
    const trigger = triggerOf(vnode)
    assert.equal(trigger.type, 'button')
    assert.match(trigger.props.class, /wf-img-preview-trigger/)
    const img = trigger.props.children // 单元素 children 被 h 展开
    assert.equal(img.type, 'img')
    assert.equal(img.props.src, 'a.png')
  })

  it('click trigger opens preview (usePopup mask 模式)', async () => {
    const ctx = mockCtx()
    const render = await Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = await r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = await r({ src: 'a.png', preview: true })
    assert.ok(v.props.children[1], '应显示预览层（portal）')
    // mock portal 直接返回内容——panel 是预览图片 vnode
    const panel = v.props.children[1]
    assert.equal(panel.props.class, 'wf-img-preview-image')
    assert.equal(panel.props.src, 'a.png')
  })

  
  
  it('fallback still works with preview', async () => {
    const vnode = await renderVNode(Img, { src: 'broken.png', fallback: 'fallback.png', preview: true }, mockCtx())!
    const img = triggerOf(vnode).props.children
    assert.equal(typeof img.props.onError, 'function')
  })
})
