import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Watermark } from './Watermark.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'


async function mount(Comp: any, props: any, ctx: any) {
  const result = await Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

// jsdom 无 canvas 2D context —— mock 最小 stub
function mockCanvas() {
  const calls: string[] = []
  const ctx2d = {
    fillText: () => { calls.push('fillText') },
    measureText: () => ({ width: 100 }),
    setTransform: () => {},
    translate: () => {},
    rotate: () => {},
    globalAlpha: 1,
    font: '',
  }
  ;(window as any).HTMLCanvasElement.prototype.getContext = () => ctx2d
  ;(window as any).HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,mock'
  return calls
}

describe('Watermark', () => {
  let calls: string[]

  beforeEach(() => { calls = mockCanvas() })

  it('renders children with overlay', async () => {
    const render = await mount(Watermark, { text: '机密', children: '内容' }, createTestCtx())!
    const v = await render({ text: '机密', children: '内容' })
    assert.match(v.props.class, /wf-watermark/)
    assert.equal(v.props.children[0], '内容') // children 是字符串
    assert.match(v.props.children[1].props.class, /wf-watermark-overlay/)
  })

  it('draws watermark text on ref mount', async () => {
    const render = await mount(Watermark, { text: '机密文件', children: 'x' }, createTestCtx())!
    const v = await render({ text: '机密文件', children: 'x' })
    v.props.children[1].props.ref(document.createElement('div'))
    assert.ok(calls.includes('fillText'), '应调用 canvas fillText 绘制水印')
  })

  it('overlay has background image after draw', async () => {
    const render = await mount(Watermark, { text: '内部资料', children: 'x' }, createTestCtx())!
    const v = await render({ text: '内部资料', children: 'x' })
    const overlay = v.props.children[1]
    overlay.props.ref(document.createElement('div'))
    // bgImage 更新闭包 → 重新 render 后 style 反映
    const v2 = await render({ text: '内部资料', children: 'x' })
    const overlay2 = v2.props.children[1]
    assert.match(overlay2.props.style.backgroundImage, /data:image/)
  })

  it('pointer-events none overlay', async () => {
    const render = await mount(Watermark, { text: 'w', children: 'x' }, createTestCtx())!
    const v = await render({ text: 'w', children: 'x' })
    const overlay = v.props.children[1]
    assert.equal(overlay.props.style.pointerEvents, 'none')
    assert.match(overlay.props.class, /wf-watermark-overlay/)
  })

  it('applies opacity prop', async () => {
    const render = await mount(Watermark, { text: 'w', opacity: 0.2, children: 'x' }, createTestCtx())!
    const v = await render({ text: 'w', opacity: 0.2, children: 'x' })
    const overlay = v.props.children[1]
    overlay.props.ref(document.createElement('div'))
    // opacity 通过 canvas globalAlpha 应用
    assert.ok(calls.length > 0)
  })
})
