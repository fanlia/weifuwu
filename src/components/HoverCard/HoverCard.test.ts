import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { HoverCard } from './HoverCard.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }), ready: true } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('HoverCard', () => {
  it('renders trigger children', () => {
    const render = mount(HoverCard, { content: '卡片', children: '悬停' }, mockCtx())!
    const vnode = render({ content: '卡片', children: '悬停' })
    assert.match(vnode.props.class, /wf-hover-card/)
    assert.equal(vnode.props.children[0], '悬停')
  })

  it('hidden by default (card has --hidden class)', () => {
    const render = mount(HoverCard, { content: '卡片', children: 'x' }, mockCtx())!
    const vnode = render({ content: '卡片', children: 'x' })
    const card = vnode.props.children[1]?.props?.children
    assert.ok(card)
    assert.match(card.props.class, /wf-hover-card--hidden/)
  })

  it('shows content after mouseenter + openDelay', async () => {
    const ctx = mockCtx()
    const render = mount(HoverCard, { content: '富内容', openDelay: 0, children: 'x' }, ctx)!
    const vnode = render({ content: '富内容', openDelay: 0, children: 'x' })
    vnode.props.onMouseEnter()
    await sleep(30)
    const vnode2 = render({ content: '富内容', openDelay: 0, children: 'x' })
    const card = vnode2.props.children[1]?.props?.children
    assert.ok(card, '应显示提示卡')
    assert.doesNotMatch(card.props.class, /--hidden/)
  })

  it('hides after mouseleave + closeDelay', async () => {
    const ctx = mockCtx()
    const render = mount(HoverCard, { content: '内容', openDelay: 0, closeDelay: 0, children: 'x' }, ctx)!
    let v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    assert.doesNotMatch(v.props.children[1].props.children.props.class, /--hidden/)
    v.props.onMouseLeave()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    assert.match(v.props.children[1].props.children.props.class, /--hidden/)
  })

  it('mouseleave before openDelay cancels open', async () => {
    const ctx = mockCtx()
    const render = mount(HoverCard, { content: '内容', openDelay: 100, children: 'x' }, ctx)!
    let v = render({ content: '内容', openDelay: 100, children: 'x' })
    v.props.onMouseEnter()
    v.props.onMouseLeave() // 在 100ms 内离开
    await sleep(30)
    v = render({ content: '内容', openDelay: 100, children: 'x' })
    assert.match(v.props.children[1].props.children.props.class, /--hidden/)
  })

  it('disabled: no portal, hover no-op', () => {
    const render = mount(HoverCard, { content: '内容', disabled: true, children: 'x' }, mockCtx())!
    const vnode = render({ content: '内容', disabled: true, children: 'x' })
    assert.equal(vnode.props.children.length, 1) // disabled 无 portal
  })

  it('Escape hides open card', async () => {
    const ctx = mockCtx()
    const render = mount(HoverCard, { content: '内容', openDelay: 0, children: 'x' }, ctx)!
    let v = render({ content: '内容', openDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, children: 'x' })
    assert.doesNotMatch(v.props.children[1].props.children.props.class, /--hidden/)
    v.props.onKeyDown({ key: 'Escape' })
    v = render({ content: '内容', openDelay: 0, children: 'x' })
    assert.match(v.props.children[1].props.children.props.class, /--hidden/)
  })

  it('renders rich content (VNode) not just string', async () => {
    const ctx = mockCtx()
    const rich = { type: 'div', props: { class: 'rich' }, children: null }
    const render = mount(HoverCard, { content: rich, openDelay: 0, children: 'x' }, ctx)!
    const v = render({ content: rich, openDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    const v2 = render({ content: rich, openDelay: 0, children: 'x' })
    const card = v2.props.children[1]?.props?.children
    assert.equal(card.props.children, rich)
  })
})
