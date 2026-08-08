import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { InfiniteScroll } from './InfiniteScroll.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

// ── mock IntersectionObserver（jsdom 无）──
let observers: MockIO[] = []
class MockIO {
  cb: any
  observed: any[] = []
  constructor(cb: any) { this.cb = cb; observers.push(this) }
  observe(el: any) { this.observed.push(el) }
  disconnect() {}
  trigger(isIntersecting = true) { this.cb([{ isIntersecting }]) }
}

describe('InfiniteScroll', () => {
  beforeEach(() => { observers = []; (globalThis as any).IntersectionObserver = MockIO })

  it('renders children content', () => {
    const render = mount(InfiniteScroll, { children: '内容' }, mockCtx())!
    const v = render({ children: '内容' })
    assert.match(v.props.class, /wf-infinite-scroll/)
    assert.equal(v.props.children[0], '内容')
  })

  it('renders sentinel with observer ref', () => {
    const render = mount(InfiniteScroll, { children: 'x' }, mockCtx())!
    const v = render({ children: 'x' })
    const sentinel = v.props.children[1]
    assert.equal(typeof sentinel.props.ref, 'function')
  })

  it('shows loading indicator when loading', () => {
    const render = mount(InfiniteScroll, { children: 'x', loading: true }, mockCtx())!
    const v = render({ children: 'x', loading: true })
    const footer = v.props.children[1]
    assert.match(footer.props.class, /wf-infinite-scroll-loading/)
  })

  it('shows end text when hasMore=false', () => {
    const render = mount(InfiniteScroll, { children: 'x', hasMore: false, endText: '没有更多了' }, mockCtx())!
    const v = render({ children: 'x', hasMore: false, endText: '没有更多了' })
    const footer = v.props.children[1]
    assert.match(footer.props.class, /wf-infinite-scroll-end/)
    assert.equal(footer.props.children, '没有更多了')
  })

  it('sentinel entering viewport triggers onLoadMore', () => {
    let loads = 0
    const ctx = mockCtx()
    const render = mount(InfiniteScroll, { children: 'x', hasMore: true, onLoadMore: () => { loads++ } }, ctx)!
    const v = render({ children: 'x', hasMore: true, onLoadMore: () => { loads++ } })
    const sentinel = v.props.children[1]
    sentinel.props.ref(document.createElement('div'))
    observers[0].trigger(true)
    assert.equal(loads, 1)
  })

  it('does not trigger when loading or hasMore=false', () => {
    let loads = 0
    const ctx = mockCtx()
    const render = mount(InfiniteScroll, { children: 'x', hasMore: false, onLoadMore: () => { loads++ } }, ctx)!
    const v = render({ children: 'x', hasMore: false, onLoadMore: () => { loads++ } })
    // hasMore=false → 渲染 end 而非 sentinel
    assert.equal(v.props.children[1].props.class, 'wf-infinite-scroll-end')
    assert.equal(loads, 0)
  })
})
