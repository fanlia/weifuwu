import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Affix } from './Affix.ts'
import type { WfuiContext } from '../../client/types.ts'

// 可控 useScrollPosition mock：scrollY 响应式驱动 fixed 判定（fixed = scroll.y >= threshold）
function mockCtx(scrollY = 0): { ctx: WfuiContext; setScrollY: (y: number) => void } {
  const scroll = { y: scrollY, refresh: () => {} }
  const ctx = {
    ui: {
      $: {}, render: () => {}, dirty: () => {},
      useScrollPosition: () => scroll,
      usePopupPosition: (opts: any) => ({
        top: 0, left: 0,
        refresh: () => {
          const el = opts.el()
          if (el) opts.compute(el.getBoundingClientRect())
        },
      }),
      ready: true,
    },
  } as any
  return { ctx, setScrollY: (y: number) => { scroll.y = y } }
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

function mockRect(el: any, top: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top, left: 0, width: 200, height: 40, bottom: top + 40, right: 200 }),
  })
}

describe('Affix', () => {
  it('页面一打开不固定（scrollY=0 < threshold，sentinel 在页面深处）', async () => {
    const { ctx } = mockCtx(0)
    const render = mount(Affix, { offsetTop: 80, children: '导航' }, ctx)!
    // 模拟 ref 挂载：sentinel 在文档 18500px 处（scrollY=0 时 rect.top=18500）
    const vnode = render({ offsetTop: 80, children: '导航' })
    mockRect(vnode.props.children[0], 18500)
    vnode.props.children[0].props.ref(vnode.props.children[0])
    await new Promise((r) => setTimeout(r, 5)) // 等微任务 recompute
    const vnode2 = render({ offsetTop: 80, children: '导航' })
    assert.doesNotMatch(vnode2.props.children[1].props.class, /--fixed/)
    assert.equal(vnode2.props.children[1].props.style, undefined)
  })

  it('renders wrapper with children', () => {
    const { ctx } = mockCtx()
    const render = mount(Affix, { children: '内容' }, ctx)!
    const vnode = render({ children: '内容' })
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-affix/)
    assert.equal(vnode.props.children[1].props.children, '内容')
  })

  it('滚过阈值后固定（scrollY >= 文档位置 - offsetTop）', async () => {
    const { ctx, setScrollY } = mockCtx(0)
    const render = mount(Affix, { offsetTop: 80, children: 'x' }, ctx)!
    const vnode = render({ offsetTop: 80, children: 'x' })
    mockRect(vnode.props.children[0], 18500) // 文档 18500，threshold = 18500-80 = 18420
    vnode.props.children[0].props.ref(vnode.props.children[0])
    await new Promise((r) => setTimeout(r, 5))
    setScrollY(18500) // 滚动到 sentinel → scrollY >= 18420 → fixed
    const vnode2 = render({ offsetTop: 80, children: 'x' })
    const content = vnode2.props.children[1]
    assert.match(content.props.class, /wf-affix-content--fixed/)
    assert.equal(content.props.style.top, '80px')
    assert.equal(content.props.style.position, 'fixed')
  })

  it('未滚到阈值时取消固定（scrollY < threshold）', async () => {
    const { ctx, setScrollY } = mockCtx(0)
    const render = mount(Affix, { offsetTop: 80, children: 'x' }, ctx)!
    const vnode = render({ offsetTop: 80, children: 'x' })
    mockRect(vnode.props.children[0], 18500)
    vnode.props.children[0].props.ref(vnode.props.children[0])
    await new Promise((r) => setTimeout(r, 5))
    setScrollY(18000) // 未到 18420
    const vnode2 = render({ offsetTop: 80, children: 'x' })
    assert.doesNotMatch(vnode2.props.children[1].props.class, /--fixed/)
    // 再滚回顶部
    setScrollY(0)
    const vnode3 = render({ offsetTop: 80, children: 'x' })
    assert.doesNotMatch(vnode3.props.children[1].props.class, /--fixed/)
  })

  it('offsetTop default is 0', async () => {
    const { ctx, setScrollY } = mockCtx(0)
    const render = mount(Affix, { children: 'x' }, ctx)!
    const vnode = render({ children: 'x' })
    mockRect(vnode.props.children[0], 100) // threshold = 100-0 = 100
    vnode.props.children[0].props.ref(vnode.props.children[0])
    await new Promise((r) => setTimeout(r, 5))
    setScrollY(150)
    const vnode2 = render({ children: 'x' })
    assert.match(vnode2.props.children[1].props.class, /--fixed/)
  })

  it('fixed content keeps wrapper width', async () => {
    const { ctx, setScrollY } = mockCtx(0)
    const render = mount(Affix, { offsetTop: 80, children: 'x' }, ctx)!
    const vnode = render({ offsetTop: 80, children: 'x' })
    mockRect(vnode.props.children[0], 18500)
    vnode.props.children[0].props.ref(vnode.props.children[0])
    await new Promise((r) => setTimeout(r, 5))
    setScrollY(18500)
    const vnode2 = render({ offsetTop: 80, children: 'x' })
    assert.equal(vnode2.props.children[1].props.style.width, '200px')
  })
})
