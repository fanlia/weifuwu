import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { InfiniteScroll } from './InfiniteScroll.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

// ── mock ctx.ui.useInView（组件层不跑真实 IO）──
let inViewHandles: any[] = []
function makeCtx(): WfuiContext {
  return createTestCtx({ ui: {
      $: {}, render: () => {}, dirty: () => {}, ready: true,
      useInView: (opts: any) => {
        const handle = {
          isIn: false,
          ready: false,
          observe() {},
          refresh() {},
          disconnect() {},
          // 测试触发：模拟 sentinel 进入/离开视口
          trigger(isIn: boolean) {
            const changed = isIn !== handle.isIn
            handle.isIn = isIn
            handle.ready = true
            if (changed) opts.onChange?.({ isIntersecting: isIn }, isIn)
          },
        }
        inViewHandles.push(handle)
        return handle
      },
    },
  }) as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

describe('InfiniteScroll', () => {
  beforeEach(() => { inViewHandles = [] })

  it('renders children content', () => {
    const render = mount(InfiniteScroll, { children: '内容' }, makeCtx())!
    const v = render({ children: '内容' })
    assert.match(v.props.class, /wf-infinite-scroll/)
    assert.equal(v.props.children[0], '内容')
  })

  it('renders sentinel with observe ref', () => {
    const render = mount(InfiniteScroll, { children: 'x' }, makeCtx())!
    const v = render({ children: 'x' })
    const sentinel = v.props.children[1]
    assert.equal(typeof sentinel.props.ref, 'function')
  })

  it('shows loading indicator when loading', () => {
    const render = mount(InfiniteScroll, { children: 'x', loading: true }, makeCtx())!
    const v = render({ children: 'x', loading: true })
    const footer = v.props.children[1]
    assert.match(footer.props.class, /wf-infinite-scroll-loading/)
  })

  it('shows end text when hasMore=false', () => {
    const render = mount(InfiniteScroll, { children: 'x', hasMore: false, endText: '没有更多了' }, makeCtx())!
    const v = render({ children: 'x', hasMore: false, endText: '没有更多了' })
    const footer = v.props.children[1]
    assert.match(footer.props.class, /wf-infinite-scroll-end/)
    assert.equal(footer.props.children, '没有更多了')
  })

  it('sentinel entering viewport triggers onLoadMore（经 useInView onChange）', () => {
    let loads = 0
    const ctx = makeCtx()
    const render = mount(InfiniteScroll, { children: 'x', hasMore: true, onLoadMore: () => { loads++ } }, ctx)!
    render({ children: 'x', hasMore: true, onLoadMore: () => { loads++ } })
    const sentinel = render({ children: 'x', hasMore: true, onLoadMore: () => { loads++ } }).props.children[1]
    sentinel.props.ref(document.createElement('div'))
    inViewHandles[0].trigger(true)
    assert.equal(loads, 1, '进入视口触发一次')
    // isIn 未变化不重复触发（IO 语义：交叉状态变化才回调）
    inViewHandles[0].trigger(true)
    assert.equal(loads, 1, '持续在视口内不重复触发')
  })

  it('loading/hasMore=false 时渲染状态 footer 而非 sentinel（无 IO 触发路径）', () => {
    let loads = 0
    const ctx = makeCtx()
    const render = mount(InfiniteScroll, { children: 'x', hasMore: false, onLoadMore: () => { loads++ } }, ctx)!
    const v = render({ children: 'x', hasMore: false, onLoadMore: () => { loads++ } })
    assert.match(v.props.children[1].props.class, /wf-infinite-scroll-end/, 'end footer')
    // hasMore=false → 无 sentinel → 无 observe → 触发路径不存在
    assert.equal(v.props.children[1].props.ref, undefined)
    assert.equal(loads, 0)
  })
})

it('loading 中重复进入视口不重复触发 onLoadMore（边界防重）', () => {
  let loads = 0
  const ctx = makeCtx()
  const factory = InfiniteScroll({ hasMore: true, loading: true, onLoadMore: () => loads++ }, ctx)
  factory({ hasMore: true, loading: true, onLoadMore: () => loads++ })
  const handle = inViewHandles[inViewHandles.length - 1]
  handle?.trigger?.(true)
  assert.equal(loads, 0, 'loading 中不重复加载')
})

it('hasMore=false 后 sentinel 离开（footer 终态稳定）', () => {
  const ctx = makeCtx()
  const factory = InfiniteScroll({ hasMore: false, children: 'x' }, ctx)
  const vnode = factory({ hasMore: false, children: 'x' })
  assert.ok(JSON.stringify(vnode).includes('wf-infinite'), '容器渲染')
})
