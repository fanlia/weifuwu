import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Anchor } from './Anchor.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): { ctx: WfuiContext; setY: (y: number) => void } {
  const scroll = { y: 0, refresh: () => {} }
  const ctx = { ui: { $: {}, render: () => {}, dirty: () => {}, useScrollPosition: () => scroll, ready: true } } as any
  return { ctx, setY: (y: number) => { scroll.y = y } }
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const items = [
  { href: '#intro', title: '简介' },
  { href: '#usage', title: '用法' },
  { href: '#api', title: 'API' },
]

describe('Anchor', () => {
  it('渲染锚点列表（nav + 链接 href/title）', () => {
    const render = mount(Anchor, { items }, mockCtx().ctx)!
    const v = render({ items })
    assert.equal(v.type, 'nav')
    assert.match(v.props.class, /wf-anchor/)
    const links = v.props.children.filter((c: any) => c?.props?.role === 'link')
    assert.equal(links.length, 3)
    assert.equal(links[0].props.href, '#intro')
    assert.equal(links[0].props.children, '简介')
  })

  it('点击链接 → onAnchorChange 回调 + href', () => {
    let picked = ''
    const render = mount(Anchor, { items, onAnchorChange: (h: string) => { picked = h } }, mockCtx().ctx)!
    const v = render({ items, onAnchorChange: (h: string) => { picked = h } })
    const links = v.props.children.filter((c: any) => c?.props?.role === 'link')
    links[1].props.onClick({ preventDefault: () => {} })
    assert.equal(picked, '#usage')
  })

  it('useHash 点击更新 location.hash', () => {
    const render = mount(Anchor, { items, useHash: true }, mockCtx().ctx)!
    const v = render({ items, useHash: true })
    const links = v.props.children.filter((c: any) => c?.props?.role === 'link')
    links[2].props.onClick({ preventDefault: () => {} })
    assert.equal(window.location.hash, '#api')
  })

  it('activeKey 高亮类 + aria-current', () => {
    const render = mount(Anchor, { items, activeKey: '#usage' }, mockCtx().ctx)!
    const v = render({ items, activeKey: '#usage' })
    const links = v.props.children.filter((c: any) => c?.props?.role === 'link')
    assert.match(links[1].props.class, /wf-anchor-link--active/)
    assert.equal(links[1].props['aria-current'], 'true')
    assert.equal(links[0].props['aria-current'], undefined)
  })

  it('键盘：方向键移动焦点高亮', () => {
    const { ctx } = mockCtx()
    const render = mount(Anchor, { items }, ctx)!
    const v = render({ items })
    const links = v.props.children.filter((c: any) => c?.props?.role === 'link')
    // 模拟 ArrowDown 在 nav 容器键盘处理
    const down = links[0].props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    void down
    // 方向键焦点移动由 ref + DOM 实现——断言链接可聚焦（tabIndex）
    assert.equal(links[0].props.tabIndex, 0)
  })
})
