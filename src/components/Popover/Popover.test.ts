/**
 * weifuwu/components — Popover test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Popover } from './Popover.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Portal, createPortal } from '../../client/vnode.ts'
import { mountVNode, patchValue } from '../../client/render.ts'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

function createMockCtx(): WfuiContext {
  return { ui: { render: () => {}, $: {}, ready: false, dirty: () => {} } } as any
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Popover', () => {
  it('render children', () => {
    const ctx = createMockCtx()
    const el = Popover({}, ctx)
    assert.ok(el)
  })

  it('默认不显示内容', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'hello' }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap')
    // open=false 时 children 只有 trigger，无 portalContent
    assert.equal(vnode.props?.children?.length, 1)
  })

  it('受控模式: open=true 显示内容', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'hello', open: true }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap wf-popover-wrap--open')
    const children = vnode.props?.children ?? []
    // children: [trigger, portalVNode]
    const portalVNode = children.find((c: any) => c?.type === Portal)
    assert.ok(portalVNode, '应渲染 Portal')
    const portalChildren = portalVNode.props.children
    const hasOverlay = portalChildren.some((c: any) => c?.props?.class === 'wf-popover-overlay')
    const hasPanel = portalChildren.some((c: any) => c?.props?.class?.startsWith('wf-popover wf-popover--'))
    assert.ok(hasOverlay, 'Portal 中应有遮罩层')
    assert.ok(hasPanel, 'Portal 中应有弹出面板')
  })

  it('受控模式: open=false 隐藏内容', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'hello', open: false }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap')
  })

  it('支持 position 属性', () => {
    const ctx = createMockCtx()
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const vnode = Popover({ content: 'x', open: true, position: pos }, ctx) as any
      const portal = vnode.props?.children?.find((c: any) => c?.type === Portal)
      const panel = portal?.props?.children?.find((c: any) => c?.props?.class?.startsWith('wf-popover wf-popover--'))
      assert.ok(panel?.props?.class?.includes(`wf-popover--${pos}`), `position=${pos} 应有对应 class`)
    }
  })

  it('disabled 时不触发', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', disabled: true }, ctx) as any
    const children = vnode.props?.children ?? []
    const trigger = children.find((c: any) => c?.props?.class === 'wf-popover-trigger')
    assert.equal(trigger?.props?.onClick, undefined)
  })

  it('trigger=hover 使用悬停事件', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', trigger: 'hover' }, ctx) as any
    assert.ok(typeof vnode.props?.onMouseEnter === 'function')
    assert.ok(typeof vnode.props?.onMouseLeave === 'function')
  })

  it('trigger=click 使用点击事件', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', trigger: 'click' }, ctx) as any
    const children = vnode.props?.children ?? []
    const trigger = children.find((c: any) => c?.props?.class === 'wf-popover-trigger')
    assert.ok(typeof trigger?.props?.onClick === 'function')
  })

  // ── DOM 测试 ─────────────────────────────────────

  function cleanPortal() {
    document.getElementById('__wf_portal')?.remove()
  }

  it('mount 后 DOM 中存在 overlay', () => {
    cleanPortal()
    const ctx = createMockCtx()
    const container = document.createElement('div')
    const vnode = Popover({ content: 'hello', open: true }, ctx)
    mountVNode(container, vnode, ctx)

    const wrap = container.querySelector('.wf-popover-wrap')
    assert.ok(wrap, 'wrap 元素应存在')

    const portal = document.getElementById('__wf_portal')
    assert.ok(portal, '__wf_portal 应存在')
    assert.ok(portal.querySelector('.wf-popover-overlay'), '__wf_portal 中应有 .wf-popover-overlay')
    assert.ok(portal.querySelector('.wf-popover'), '__wf_portal 中应有 .wf-popover')
  })

  it('点击 trigger 后 DOM 中出现 overlay', () => {
    cleanPortal()
    const ctx = createMockCtx()
    const container = document.createElement('div')
    const vnode = Popover({ content: 'hello' }, ctx)
    mountVNode(container, vnode, ctx)

    let portal = document.getElementById('__wf_portal')
    assert.ok(!portal?.querySelector('.wf-popover-overlay'))

    const vnodeOpen = Popover({ content: 'hello', open: true }, ctx)
    const wrap = container.querySelector('.wf-popover-wrap')!
    patchValue(container, wrap, vnode, vnodeOpen, ctx)

    portal = document.getElementById('__wf_portal')
    assert.ok(portal?.querySelector('.wf-popover-overlay'), 'patch 后 __wf_portal 中应有 .wf-popover-overlay')
    assert.ok(portal?.querySelector('.wf-popover'), 'patch 后 __wf_portal 中应有 .wf-popover')
  })

  it('通过 patchValue 模拟 open → close 状态切换', () => {
    cleanPortal()
    const ctx = createMockCtx()
    const container = document.createElement('div')

    const v1 = h(Popover, { content: 'hello' })
    mountVNode(container, v1, ctx)
    let portal = document.getElementById('__wf_portal')
    assert.ok(!portal?.querySelector('.wf-popover-overlay'))

    const v2 = h(Popover, { content: 'hello', open: true })
    const wrap = container.querySelector('.wf-popover-wrap')!
    patchValue(container, wrap, v1, v2, ctx)
    portal = document.getElementById('__wf_portal')
    assert.ok(portal?.querySelector('.wf-popover-overlay'), 'open=true → portal 中应有 overlay')
    assert.ok(portal?.querySelector('.wf-popover'), 'open=true → portal 中应有 panel')

    // 关闭
    const v3 = h(Popover, { content: 'hello', open: false })
    patchValue(container, wrap, v2, v3, ctx)
    portal = document.getElementById('__wf_portal')
    assert.ok(!portal?.querySelector('.wf-popover-overlay'), 'open=false → overlay 应消失')
    assert.ok(!portal?.querySelector('.wf-popover'), 'open=false → panel 应消失')
  })
})
