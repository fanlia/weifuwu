import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Carousel } from './Carousel.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const slides = ['A', 'B', 'C'].map(t => ({ type: 'div' as const, props: { class: 'slide' }, children: t }))

/** track 在 viewport 内层 */
const trackOf = (v: any) =>
  v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-viewport'))?.props?.children

describe('Carousel', () => {
  it('renders slides container', () => {
    const render = mount(Carousel, { children: slides }, mockCtx())!
    const v = render({ children: slides })
    assert.match(v.props.class, /wf-carousel/)
  })

  it('renders all slides in track', () => {
    const render = mount(Carousel, { children: slides }, mockCtx())!
    const v = render({ children: slides })
    const track = trackOf(v)
    assert.equal(track.props.children.length, 3)
  })

  it('starts at index 0', () => {
    const render = mount(Carousel, { children: slides }, mockCtx())!
    const v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /0%/)
  })

  it('next button advances', () => {
    const ctx = mockCtx()
    const render = mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const next = v.props.children.find((c: any) => c?.props?.['aria-label'] === '下一张')
    next.props.onClick()
    v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /-100%/)
  })

  it('renders dots for each slide', () => {
    const render = mount(Carousel, { children: slides }, mockCtx())!
    const v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    assert.equal(dots.props.children.length, 3)
  })

  it('dot click jumps to slide', () => {
    const ctx = mockCtx()
    const render = mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    dots.props.children[2].props.onClick()
    v = render({ children: slides })
    assert.match(trackOf(v).props.style.transform, /-200%/)
  })

  it('active dot marked', () => {
    const ctx = mockCtx()
    const render = mount(Carousel, { children: slides }, ctx)!
    let v = render({ children: slides })
    const dots = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    dots.props.children[1].props.onClick()
    v = render({ children: slides })
    const dots2 = v.props.children.find((c: any) => c?.props?.class?.includes('wf-carousel-dots'))
    assert.match(dots2.props.children[1].props.class, /--active/)
  })

  it('loop wraps around', () => {
    const ctx = mockCtx()
    const render = mount(Carousel, { children: slides, loop: true }, ctx)!
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

  it('no dots when showDots=false', () => {
    const render = mount(Carousel, { children: slides, showDots: false }, mockCtx())!
    const v = render({ children: slides, showDots: false })
    assert.ok(!v.props.children.some((c: any) => c?.props?.class?.includes('wf-carousel-dots')))
  })

  it('no arrows when showArrows=false', () => {
    const render = mount(Carousel, { children: slides, showArrows: false }, mockCtx())!
    const v = render({ children: slides, showArrows: false })
    assert.ok(!v.props.children.some((c: any) => c?.props?.['aria-label'] === '下一张'))
  })
})
