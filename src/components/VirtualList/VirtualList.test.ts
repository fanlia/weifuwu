import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { VirtualList } from './VirtualList.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

// 可控 useScrollPosition mock：y 驱动可见窗口（scrollTop 响应式）
function makeCtx(scrollY = 0): { ctx: WfuiContext; setY: (y: number) => void } {
  const scroll = { y: scrollY, refresh: () => {} }
  const ctx = createTestCtx({ ui: { useScrollPosition: () => scroll } }) as any
  return { ctx, setY: (y: number) => { scroll.y = y } }
}

async function mount(Comp: any, props: any, ctx: any) {
  const result = await Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const items = Array.from({ length: 100 }, (_, i) => ({ id: i, label: `item-${i}` }))

const renderItem = (item: any) => ({ type: 'div' as const, props: { class: 'vit-item' }, children: item.label })

describe('VirtualList', () => {
  it('renders only visible items, not all 100', async () => {
    const render = await mount(VirtualList, { items, height: 400, itemHeight: 40, renderItem }, makeCtx().ctx)!
    const v = await render({ items, height: 400, itemHeight: 40, renderItem })
    const list = v.props.children[1] // [spacer, list]
    const visible = list.props.children
    assert.ok(visible.length < 100, `应只渲染可见项，实际 ${visible.length}`)
    assert.ok(visible.length >= 10, '可见区 10 项 + overscan')
  })

  it('spacer has total height', async () => {
    const render = await mount(VirtualList, { items, height: 400, itemHeight: 40, renderItem }, makeCtx().ctx)!
    const v = await render({ items, height: 400, itemHeight: 40, renderItem })
    const spacer = v.props.children[0]
    assert.equal(spacer.props.style.height, '4000px') // 100 * 40
  })

  it('scrolling changes visible window', async () => {
    const { ctx } = makeCtx(0)
    const render = await mount(VirtualList, { items, height: 400, itemHeight: 40, overscan: 0, renderItem }, ctx)!
    let v = await render({ items, height: 400, itemHeight: 40, overscan: 0, renderItem })
    const container = document.createElement('div')
    v.props.ref(container)
    // 滚动到 1000px → 可见区从 item 25 开始（render 内主动同步 el.scrollTop）
    container.scrollTop = 1000
    v = await render({ items, height: 400, itemHeight: 40, overscan: 0, renderItem })
    const list = v.props.children[1]
    const first = list.props.children[0]
    assert.equal(first.props.children.children, 'item-25') // renderItem VNode 顶层 children
  })

  it('item positions are absolute with top offset', async () => {
    const render = await mount(VirtualList, { items, height: 400, itemHeight: 40, renderItem }, makeCtx().ctx)!
    const v = await render({ items, height: 400, itemHeight: 40, renderItem })
    const list = v.props.children[1]
    const first = list.props.children[0]
    assert.equal(first.props.style.top, '0px')
  })

  it('container has fixed height and scroll', async () => {
    const render = await mount(VirtualList, { items, height: 300, itemHeight: 40, renderItem }, makeCtx().ctx)!
    const v = await render({ items, height: 300, itemHeight: 40, renderItem })
    assert.match(v.props.class, /wf-virtual-list/)
    assert.equal(v.props.style.height, '300px')
    assert.equal(v.props.style.overflowY, 'auto')
  })
})
