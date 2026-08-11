import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Carousel } from './Carousel.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'


async function mount(Comp: any, props: any, ctx: any) {
  const result = await Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const slides = ['A', 'B', 'C'].map(t => ({ type: 'div' as const, props: { class: 'slide' }, children: t }))

/** track 在 viewport 内层 */
const trackOf = (v: any) =>
  v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-viewport'))?.props?.children

describe('Carousel', () => {
  it('renders slides container', async () => {
    const render = await mount(Carousel, { children: slides }, createTestCtx())!
    const v = render({ children: slides })
    assert.match(v.props.class, /wf-carousel/)
  })

  it('renders all slides in track', async () => {
    const render = await mount(Carousel, { children: slides }, createTestCtx())!
    const v = render({ children: slides })
    const track = trackOf(v)
    assert.equal(track.props.children.length, 3)
  })

  it('starts at index 0', async () => {
    const render = await mount(Carousel, { children: slides }, createTestCtx())!
    const v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /0%/)
  })

  it('next button advances', async () => {
    const ctx = createTestCtx()
    const render = await mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const next = v.props.children.find((c: any) => c?.props?.['aria-label'] === '下一张')
    next.props.onClick()
    v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /-100%/)
  })

  it('renders dots for each slide', async () => {
    const render = await mount(Carousel, { children: slides }, createTestCtx())!
    const v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    assert.equal(dots.props.children.length, 3)
  })

  it('dot click jumps to slide', async () => {
    const ctx = createTestCtx()
    const render = await mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    dots.props.children[2].props.onClick()
    v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /-200%/)
  })

  it('active dot marked', async () => {
    const ctx = createTestCtx()
    const render = await mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    dots.props.children[1].props.onClick()
    v = render({ children: slides })
    const dots2 = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    assert.match(dots2.props.children[1].props.class, /--active/)
  })

  it('loop wraps around', async () => {
    const ctx = createTestCtx()
    const render = await mount(Carousel, { children: slides, loop: true }, ctx)!
    let v = render({ children: slides, loop: true })
    // 从 0 → 2 → 再 next 回到 0
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    dots.props.children[2].props.onClick()
    v = render({ children: slides, loop: true })
    const next = v.props.children.find((c: any) => c?.props?.['aria-label'] === '下一张')
    next.props.onClick()
    v = render({ children: slides, loop: true })
    assert.match(trackOf(v).props.style.transform, /0%/)
  })

  it('no dots when showDots=false', async () => {
    const render = await mount(Carousel, { children: slides, showDots: false }, createTestCtx())!
    const v = render({ children: slides, showDots: false })
    assert.ok(!v.props.children.some((c: any) => c?.props?.class?.includes('wf-carousel-dots')))
  })

  it('no arrows when showArrows=false', async () => {
    const render = await mount(Carousel, { children: slides, showArrows: false }, createTestCtx())!
    const v = render({ children: slides, showArrows: false })
    assert.ok(!v.props.children.some((c: any) => c?.props?.['aria-label'] === '下一张'))
  })

  it('autoplay advances automatically at interval', async () => {
    const ctx = createTestCtx()
    const render = await mount(Carousel, { children: slides, autoplay: true, interval: 40 }, ctx)!
    let v = render({ children: slides, autoplay: true, interval: 40 })
    assert.match(trackOf(v).props.style.transform, /0%/)
    // 模拟挂载：ref 挂载后 stableRef 启动 autoplay timer
    const root = v.props.children.find((c: any) => c?.props?.class === 'wf-carousel') ?? v
    root.props.ref?.(document.createElement('div'))
    await new Promise((r) => setTimeout(r, 100)) // 2+ interval（40ms）
    v = render({ children: slides, autoplay: true, interval: 40 })
    // 100ms / 40ms ≈ 2-3 次自动切换 → 已离开第 1 张（精确比较，避免 -200% 含 0% 子串误判）
    const t = trackOf(v).props.style.transform
    assert.notEqual(t, 'translateX(0%)', 'autoplay 应自动切换')
    assert.notEqual(t, 'translateX(-0%)', 'autoplay 应自动切换')
    root.props.ref?.(null) // 清理 interval（防测试进程挂起）
  })
})
