import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Img } from './Img.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function mockCtx(){
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    // mock 真注册（DOM 级 Escape 测试需要真实 window 监听路径）
    useGlobalKey: (h: any) => { window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) },
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

  it('click trigger opens preview overlay', async () => {
    const ctx = mockCtx()
    const render = await Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = r({ src: 'a.png', preview: true })
    assert.ok(v.props.children[1], '应显示预览层')
    const overlay = v.props.children[1].props.children
    assert.match(overlay.props.class, /wf-img-preview-overlay/)
    assert.equal(overlay.props.children.props.src, 'a.png')
  })

  it('Escape closes preview（DOM 级：焦点在 portal overlay 内也生效）', async () => {
    const ctx = mockCtx()
    const render = await Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    // DOM 级：真实挂载 + 同树 patch（AGENTS.md：mountVNode 重挂会残留 portal 脏节点）
    const { mountVNode, patchValue } = await import('../../ui-dom/render.ts')
    const container = document.createElement('div')
    document.body.appendChild(container)
    let prev = r({ src: 'a.png', preview: true })
    await mountVNode(container, prev, ctx as any)
    // 打开 preview（mockCtx.render 为空函数——手动重建 vnode + patch 模拟重渲染）
    ;(container.querySelector('.wf-img-preview-trigger') as HTMLButtonElement).click()
    const next = r({ src: 'a.png', preview: true })
    patchValue(container, container.firstChild, prev, next, ctx as any)
    prev = next
    assert.ok(document.querySelector('.wf-img-preview-overlay'), 'overlay 已打开（portal 挂载）')
    // 焦点在 overlay 内（portal 子树）派发 Escape——必须关闭（document 级监听）
    const overlay = document.querySelector('.wf-img-preview-overlay') as HTMLElement
    overlay.focus?.()
    window.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape' })) // useGlobalKey：window 级
    await new Promise(res => setTimeout(res, 0))
    // close() 已执行（previewOpen=false）——patch 重渲染，portal overlay 应被移除
    const after = r({ src: 'a.png', preview: true })
    patchValue(container, container.firstChild, prev, after, ctx as any)
    assert.ok(!document.querySelector('.wf-img-preview-overlay'), 'portal overlay 内 Escape 应关闭')
    document.body.removeChild(container)
    document.querySelectorAll('#__wf_portal').forEach(el => el.remove())
  })

  it('click overlay closes preview', async () => {
    const ctx = mockCtx()
    const render = await Img({ src: 'a.png', preview: true }, ctx)
    const r = render as any
    let v = r({ src: 'a.png', preview: true })
    triggerOf(v).props.onClick()
    v = r({ src: 'a.png', preview: true })
    const overlay = wrapChildren(v)[1].props.children
    overlay.props.onClick({ target: overlay, currentTarget: overlay })
    v = r({ src: 'a.png', preview: true })
    assert.equal(wrapChildren(v).length, 1)
  })

  it('fallback still works with preview', async () => {
    const vnode = await renderVNode(Img, { src: 'broken.png', fallback: 'fallback.png', preview: true }, mockCtx())!
    const img = triggerOf(vnode).props.children
    assert.equal(typeof img.props.onError, 'function')
  })
})
