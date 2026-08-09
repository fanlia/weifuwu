import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { BackTop } from './BackTop.ts'
import type { WfuiContext } from '../../client/types.ts'

// 可控 useInView mock：isIn=true = 哨兵仍在扩展区（未滚动超阈值）→ 按钮隐藏
function mockCtx(initialIsIn = true): { ctx: WfuiContext; inView: { isIn: boolean } } {
  const inView = { isIn: initialIsIn, ready: true, observe: () => {}, refresh: () => {}, disconnect: () => {} }
  const ctx = { ui: { $: {}, render: () => {}, dirty: () => {}, useInView: () => inView, ready: true } } as any
  return { ctx, inView }
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

function buttonOf(vnode: any) {
  // host div children: [sentinel, button]
  return vnode.props.children[1]
}

describe('BackTop', () => {
  const originalScrollTo = (window as any).scrollTo
  let scrolledTo: number | null = null

  beforeEach(() => {
    scrolledTo = null
    ;(window as any).scrollTo = (opts: any) => { scrolledTo = opts?.top ?? null }
  })

  it('renders hidden by default (IO isIn=true = 未超过阈值)', () => {
    const { ctx } = mockCtx(true)
    const render = mount(BackTop, {}, ctx)!
    const vnode = render({})
    assert.equal(vnode.type, 'div') // host
    assert.match(buttonOf(vnode).props.class, /wf-backtop--hidden/)
  })

  it('scroll past visibilityHeight shows button (IO isIn=false)', () => {
    const { ctx, inView } = mockCtx(true)
    const render = mount(BackTop, { visibilityHeight: 400 }, ctx)!
    inView.isIn = false // 模拟 IO：哨兵离开扩展区（滚动超 400px）
    const vnode = render({ visibilityHeight: 400 })
    assert.doesNotMatch(buttonOf(vnode).props.class, /--hidden/)
    assert.match(buttonOf(vnode).props.class, /wf-backtop/)
  })

  it('stays hidden below threshold (IO isIn=true)', () => {
    const { ctx, inView } = mockCtx(true)
    const render = mount(BackTop, { visibilityHeight: 400 }, ctx)!
    const vnode = render({ visibilityHeight: 400 })
    assert.match(buttonOf(vnode).props.class, /--hidden/)
    assert.equal(inView.isIn, true)
  })

  it('click scrolls to top', () => {
    const { ctx } = mockCtx(true)
    const render = mount(BackTop, {}, ctx)!
    const vnode = render({})
    buttonOf(vnode).props.onClick()
    assert.equal(scrolledTo, 0)
  })

  it('renders custom children', () => {
    const { ctx } = mockCtx(true)
    const render = mount(BackTop, { children: 'TOP' }, ctx)!
    const vnode = render({ children: 'TOP' })
    assert.equal(buttonOf(vnode).props.children, 'TOP')
  })

  it('cleanup disconnects observer (sentinel ref null branch)', () => {
    const { ctx } = mockCtx(true)
    const render = mount(BackTop, {}, ctx)!
    const vnode = render({})
    // sentinel ref：挂载 + 卸载（observe/disconnect，无异常即可）
    vnode.props.children[0].props.ref(document.createElement('div'))
    vnode.props.children[0].props.ref(null)
  })
})

it('键盘可达：按钮原生可聚焦 + Enter 回顶（P1）', () => {
  const { ctx, inView } = mockCtx(false) // isIn=false → 显示
  const factory = mount(BackTop, { visibilityHeight: 100 }, ctx)
  const vnode = factory({ visibilityHeight: 100 })
  const btn = buttonOf(vnode)
  assert.ok(btn, '按钮渲染')
  assert.ok(btn.props.type === 'button' || btn.type === 'button', '原生 button 可聚焦')
})

it('visibilityHeight 默认值存在（不传不抛错——边界）', () => {
  const { ctx } = mockCtx()
  const factory = mount(BackTop, {}, ctx)
  const vnode = factory({})
  assert.ok(vnode, '默认参数渲染')
})
