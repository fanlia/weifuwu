/**
 * weifuwu/components — Popover test
 *
 * 迁移 usePopup 后：外部点击由 document 监听接管（不再有 overlay）；
 * portal 内容根附加 wf-popup 基类 + inline 定位。
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Popover } from './Popover.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h, Portal } from '../../ui-dom/vnode.ts'
import { mountToDom, patchToDom, buildToDom } from '../../ui-dom/testing.ts'
import { setupJsdom } from '../../test/client/setup.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
setupJsdom()

/** usePopup mock：镜像真实语义（受控 isOpen + wf-popup 合并 + disabled/closed → portal null） */
function createMockCtx(): WfuiContext {
  const openStates = new Map<string, boolean>()
  return { ui: {
    render: () => {}, $: () => ({}), dirty: () => {},
    useOpen: (opts: any) => {
      const key = opts.name ?? 'default'
      if (!openStates.has(key)) openStates.set(key, false)
      const controlled = opts.open !== undefined
      const isOpen = () => controlled ? !!opts.open : (openStates.get(key) ?? false)
      const setOpen = (v: boolean) => {
        if (controlled) opts.onOpenChange?.(v)
        else openStates.set(key, v)
      }
      return { get open() { return isOpen() }, setOpen, triggerProps: { onClick: () => setOpen(true), onFocus: () => {} } }
    },
    usePopup: (opts: any) => {
      const isOpen = () => (opts.isOpen ? opts.isOpen() : false)
      const portal = (content: any) => {
        if (opts.disabled?.() || !isOpen()) return null
        return {
          type: Portal,
          props: {
            children: {
              ...content,
              props: {
                ...content.props,
                class: ['wf-popup', content.props?.class].filter(Boolean).join(' '),
                style: { ...content.props?.style, position: 'fixed', top: '0px', left: '0px' },
              },
            },
            portalKey: 'popover',
          },
          key: undefined,
          _placement: 'remote',
        }
      }
      return {
        open: isOpen(),
        setOpen: (v: any) => { opts.onOpenChange?.(v) },
        wrapProps: {
          onClick: () => { opts.onOpenChange?.(!isOpen()) },
          onMouseEnter: () => {}, onMouseLeave: () => {},
          onFocus: () => {}, onBlur: () => {},
          onKeyDown: (e: any) => { if (e.key === 'Escape') opts.setOpen?.(false) },
        },
        portal,
        refresh: () => {},
      }
    },
  } } as any
}

/** Call component and get VNode (compatible with two-phase model) */

describe('Popover', () => {
  it('render children', async () => {
    const ctx = createMockCtx()
    const el = await renderVNode(Popover, {}, ctx)
    assert.ok(el)
  })

  it('默认不显示内容', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'hello', children: 'trigger' }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap')
    // open=false 时 children 包含 trigger，无 portalContent
    assert.equal(vnode.props?.children?.length, 1)
    assert.equal(vnode.props?.children[0], 'trigger')
  })

  it('受控模式: open=true 显示内容', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'hello', open: true }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap wf-popover-wrap--open')
    const children = vnode.props?.children ?? []
    const portalVNode = children.find((c: any) => c?.type === Portal)
    assert.ok(portalVNode, '应渲染 Portal')
    const panel = portalVNode.props.children
    assert.ok(panel.props.class.includes('wf-popover wf-popover--'), '面板应有 wf-popover class')
    assert.ok(panel.props.class.includes('wf-popup'), '面板应附加 wf-popup 基类')
    assert.ok(!panel.props.class.includes('wf-popover-overlay'), 'usePopup 接管外部点击，无 overlay')
  })

  it('受控模式: open=false 隐藏内容', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'hello', open: false }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap')
  })

  it('支持 position 属性', async () => {
    const ctx = createMockCtx()
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const vnode = await renderVNode(Popover, { content: 'x', open: true, position: pos }, ctx) as any
      const portal = vnode.props?.children?.find((c: any) => c?.type === Portal)
      const panel = portal?.props?.children
      assert.ok(panel, `position=${pos}: panel should exist`)
      assert.match(panel.props.class, new RegExp(`wf-popover--${pos}`))
      // 定位由 usePopup inline style 提供
      assert.ok(panel.props?.style?.top !== undefined && panel.props?.style?.left !== undefined)
    }
  })

  it('disabled 时不渲染 portal', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'x', children: 'trigger', disabled: true, open: true }, ctx) as any
    const children = vnode.props?.children ?? []
    assert.equal(children.length, 1, 'disabled 只有 trigger，无 portal')
  })

  it('trigger=hover 使用悬停事件（来自 usePopup.wrapProps）', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'x', trigger: 'hover' }, ctx) as any
    assert.ok(typeof vnode.props?.onMouseEnter === 'function')
    assert.ok(typeof vnode.props?.onMouseLeave === 'function')
  })

  it('trigger=click 使用点击事件', async () => {
    const ctx = createMockCtx()
    const vnode = await renderVNode(Popover, { content: 'x', trigger: 'click', children: 'trigger' }, ctx) as any
    assert.ok(typeof vnode.props?.onClick === 'function', '根元素应有 onClick')
  })

  // ── DOM 测试 ─────────────────────────────────────

  function cleanPortal() {
    document.getElementById('__wf_portal')?.remove()
  }

  it('mount 后 DOM 中 portal 存在 panel（无 overlay）', async () => {
    cleanPortal()
    const ctx = createMockCtx()
    const container = document.createElement('div')
    const vnode = await renderVNode(Popover, { content: 'hello', open: true }, ctx)
    await mountToDom(container, vnode, ctx)

    const wrap = container.querySelector('.wf-popover-wrap')
    assert.ok(wrap, 'wrap 元素应存在')

    const portal = document.getElementById('__wf_portal')
    assert.ok(portal, '__wf_portal 应存在')
    assert.ok(portal.querySelector('.wf-popover'), '__wf_portal 中应有 .wf-popover')
    assert.ok(!portal.querySelector('.wf-popover-overlay'), 'usePopup 模式下无 overlay')
  })

  it('通过 patchValue 模拟受控 open 切换（受控模式 mount 期固定）', async () => {
    cleanPortal()
    const ctx = createMockCtx()
    const container = document.createElement('div')

    const v1 = (await buildToDom(h(Popover, { content: 'hello', open: false }), ctx)) as any
    await mountToDom(container, v1, ctx)
    let portal = document.getElementById('__wf_portal')
    assert.ok(!portal?.querySelector('.wf-popover'), 'open=false 无 panel')

    const v2 = (await buildToDom(h(Popover, { content: 'hello', open: true }), ctx)) as any
    const wrap = container.querySelector('.wf-popover-wrap')!
    await patchToDom(container, wrap, v1, v2, ctx)
    portal = document.getElementById('__wf_portal')
    assert.ok(portal?.querySelector('.wf-popover'), 'open=true → portal 中应有 panel')

    // 关闭
    const v3 = (await buildToDom(h(Popover, { content: 'hello', open: false }), ctx)) as any
    await patchToDom(container, wrap, v2, v3, ctx)
    portal = document.getElementById('__wf_portal')
    assert.ok(!portal?.querySelector('.wf-popover'), 'open=false → panel 应消失')
  })

  it('Escape 关闭（受控 onOpenChange(false)）', async () => {
    const ctx = createMockCtx()
    let closed = 0
    const vnode = await renderVNode(Popover, {
      content: 'hello', children: 'trigger', open: true,
      onOpenChange: (v: boolean) => { if (!v) closed++ },
    }, ctx) as any
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    vnode.props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, 1)
    vnode.props.onKeyDown({ key: 'Tab' })
    assert.equal(closed, 1, '非 Escape 键不关闭')
  })
})
