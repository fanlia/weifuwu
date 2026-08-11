import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { HoverCard } from './HoverCard.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

/** usePopup mock：镜像真实语义（openDelay/closeDelay 定时 + disabled/closed → portal null） */
function makeCtx(show = false): WfuiContext {
  const openStates = new Map<string, boolean>()
  return createTestCtx({ ui: {
    useOpen: (opts: any) => {
      const key = opts.name ?? 'default'
      if (!openStates.has(key)) openStates.set(key, show)
      const controlled = opts.open !== undefined
      const isOpen = () => controlled ? !!opts.open : (openStates.get(key) ?? false)
      const setOpen = (v: boolean) => {
        if (controlled) opts.onOpenChange?.(v)
        else openStates.set(key, v)
      }
      return { get open() { return isOpen() }, setOpen, triggerProps: { onClick: () => setOpen(true), onFocus: () => {} } }
    },
    usePopup: (opts: any) => {
      // 对齐真实 usePopup：isOpen 函数 + setOpen 驱动（受控走 onOpenChange）
      let open = show
      const portal = (content: any) => {
        if (opts.disabled?.() || !open) return null
        return {
          type: Portal,
          props: {
            children: { ...content, props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' ') } },
            portalKey: 'popover',
          },
          key: undefined,
          _placement: 'remote',
        }
      }
      return {
        open,
        setOpen: (v: boolean) => { open = v },
        wrapProps: {
          onMouseEnter: () => { setTimeout(() => { open = true }, opts.openDelay?.() ?? 0) },
          onMouseLeave: () => { setTimeout(() => { open = false }, opts.closeDelay?.() ?? 0) },
          onFocus: () => {},
          onBlur: () => {},
          onKeyDown: (e: any) => { if (e.key === 'Escape') open = false },
        },
        portal,
        refresh: () => {},
      }
    },
  } }) as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('HoverCard', () => {
  it('renders trigger children', () => {
    const render = mount(HoverCard, { content: '卡片', children: '悬停' }, makeCtx())!
    const vnode = render({ content: '卡片', children: '悬停' })
    assert.match(vnode.props.class, /wf-hover-card/)
    assert.equal(vnode.props.children[0], '悬停')
  })

  it('no portal when closed（usePopup 卸载语义）', () => {
    const render = mount(HoverCard, { content: '卡片', children: 'x' }, makeCtx(false))!
    const vnode = render({ content: '卡片', children: 'x' })
    assert.equal(vnode.props.children.length, 1, '关闭时只有 trigger，无 portal')
  })

  it('shows content after mouseenter + openDelay', async () => {
    const render = mount(HoverCard, { content: '富内容', openDelay: 0, children: 'x' }, makeCtx())!
    const vnode = render({ content: '富内容', openDelay: 0, children: 'x' })
    vnode.props.onMouseEnter()
    await sleep(30)
    const vnode2 = render({ content: '富内容', openDelay: 0, children: 'x' })
    const portal = vnode2.props.children[1]
    assert.ok(portal, '应显示提示卡')
    assert.equal(portal.type, Portal)
  })

  it('hides after mouseleave + closeDelay', async () => {
    const render = mount(HoverCard, { content: '内容', openDelay: 0, closeDelay: 0, children: 'x' }, makeCtx())!
    let v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    assert.ok(v.props.children[1], '打开后有 portal')
    v.props.onMouseLeave()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, closeDelay: 0, children: 'x' })
    assert.equal(v.props.children.length, 1, '关闭后无 portal')
  })

  it('mouseleave before openDelay cancels open', async () => {
    const render = mount(HoverCard, { content: '内容', openDelay: 100, children: 'x' }, makeCtx())!
    let v = render({ content: '内容', openDelay: 100, children: 'x' })
    v.props.onMouseEnter()
    v.props.onMouseLeave() // 在 100ms 内离开
    await sleep(30)
    v = render({ content: '内容', openDelay: 100, children: 'x' })
    assert.equal(v.props.children.length, 1, '延迟内离开不应打开')
  })

  it('disabled: no portal, hover no-op', () => {
    const render = mount(HoverCard, { content: '内容', disabled: true, children: 'x' }, makeCtx())!
    const vnode = render({ content: '内容', disabled: true, children: 'x' })
    assert.equal(vnode.props.children.length, 1) // disabled 无 portal
  })

  it('Escape hides open card', async () => {
    const render = mount(HoverCard, { content: '内容', openDelay: 0, children: 'x' }, makeCtx())!
    let v = render({ content: '内容', openDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    v = render({ content: '内容', openDelay: 0, children: 'x' })
    assert.ok(v.props.children[1], '打开后有 portal')
    v.props.onKeyDown({ key: 'Escape' })
    v = render({ content: '内容', openDelay: 0, children: 'x' })
    assert.equal(v.props.children.length, 1, 'Escape 后无 portal')
  })

  it('renders rich content (VNode) not just string', async () => {
    const rich = { type: 'div', props: { class: 'rich' }, children: null }
    const render = mount(HoverCard, { content: rich, openDelay: 0, children: 'x' }, makeCtx())!
    const v = render({ content: rich, openDelay: 0, children: 'x' })
    v.props.onMouseEnter()
    await sleep(30)
    const v2 = render({ content: rich, openDelay: 0, children: 'x' })
    const card = v2.props.children[1]?.props?.children
    assert.equal(card.props.children, rich)
  })
})
