/**
 * weifuwu/components — Popover test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Popover } from './Popover.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { mountVNode, patchValue } from '../../client/render.ts'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

function createMockCtx(): WfuiContext {
  return {
    ui: {
      render: () => {},
      $: {},
      ready: false,
      dirty: () => {},
    },
  } as any
}

describe('Popover', () => {
  it('render children', () => {
    const ctx = createMockCtx()
    const vnode = h(Popover, {}, h('button', { type: 'button' }, '打开'))
    const el = Popover({}, ctx)
    assert.ok(el)
  })

  it('默认不显示内容', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'hello' }, ctx) as any
    // 没有 open 相关 class
    assert.equal(vnode.props?.class, 'wf-popover-wrap')
    const children = vnode.props?.children ?? []
    const hasOverlay = children.some((c: any) => c?.props?.class === 'wf-popover-overlay')
    const hasPanel = children.some((c: any) => c?.props?.class?.startsWith('wf-popover '))
    assert.ok(!hasOverlay, '不应渲染遮罩层')
    assert.ok(!hasPanel, '不应渲染弹出面板')
  })

  it('受控模式: open=true 显示内容', () => {
    const ctx = createMockCtx()
    // 直接调用渲染验证
    const vnode = Popover({ content: 'hello', open: true }, ctx) as any
    assert.equal(vnode.props?.class, 'wf-popover-wrap wf-popover-wrap--open')
    // children 的第一个 wrapper 之后应该能看到 popover 和 overlay
    const children = vnode.props?.children ?? []
    const hasOverlay = children.some((c: any) => c?.props?.class === 'wf-popover-overlay')
    const hasPanel = children.some((c: any) => c?.props?.class?.startsWith('wf-popover wf-popover--'))
    assert.ok(hasOverlay, '应渲染遮罩层')
    assert.ok(hasPanel, '应渲染弹出面板')
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
      const children = vnode.props?.children ?? []
      const panel = children.find((c: any) => c?.props?.class?.startsWith('wf-popover wf-popover--'))
      assert.ok(panel?.props?.class?.includes(`wf-popover--${pos}`), `position=${pos} 应有对应 class`)
    }
  })

  it('disabled 时不触发', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', disabled: true }, ctx) as any
    const children = vnode.props?.children ?? []
    const trigger = children.find((c: any) => c?.props?.class === 'wf-popover-trigger')
    // trigger 不应有 onClick
    assert.equal(trigger?.props?.onClick, undefined)
  })

  it('trigger=hover 使用悬停事件', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', trigger: 'hover' }, ctx) as any
    const wrap = vnode
    assert.ok(typeof wrap.props?.onMouseEnter === 'function')
    assert.ok(typeof wrap.props?.onMouseLeave === 'function')
  })

  it('trigger=click 使用点击事件', () => {
    const ctx = createMockCtx()
    const vnode = Popover({ content: 'x', trigger: 'click' }, ctx) as any
    const children = vnode.props?.children ?? []
    const trigger = children.find((c: any) => c?.props?.class === 'wf-popover-trigger')
    assert.ok(typeof trigger?.props?.onClick === 'function')
  })

  // ── 通过渲染管道测试 ──────────────────────────────
  // VNode → mountVNode → DOM，验证遮罩层在 DOM 中存在

  it('mount 后 DOM 中存在 overlay', () => {
    const ctx = createMockCtx()
    const container = document.createElement('div')
    const vnode = Popover({ content: 'hello', open: true }, ctx)
    mountVNode(container, vnode, ctx)

    const wrap = container.querySelector('.wf-popover-wrap')
    assert.ok(wrap, 'wrap 元素应存在')

    const children = wrap!.children
    const classes = Array.from(children).map(c => c.className)
    console.log('DOM children classes:', classes)

    const hasOverlay = wrap!.querySelector('.wf-popover-overlay')
    const hasPanel = wrap!.querySelector('.wf-popover')
    assert.ok(hasOverlay, 'mount 后 DOM 中应有 .wf-popover-overlay')
    assert.ok(hasPanel, 'mount 后 DOM 中应有 .wf-popover')
  })

  it('点击 trigger 后 DOM 中出现 overlay', () => {
    const ctx = createMockCtx()
    const container = document.createElement('div')
    const vnode = Popover({ content: 'hello' }, ctx)  // open=false
    mountVNode(container, vnode, ctx)

    // 初始状态：无 overlay
    assert.ok(!container.querySelector('.wf-popover-overlay'))
    assert.ok(!container.querySelector('.wf-popover'))

    // 模拟点击 trigger（VNode 外直接更换 VNode 模拟状态变化）
    const vnodeOpen = Popover({ content: 'hello', open: true }, ctx)
    const wrap = container.querySelector('.wf-popover-wrap')!
    patchValue(container, wrap, vnode, vnodeOpen, ctx)

    const hasOverlay = container.querySelector('.wf-popover-overlay')
    const hasPanel = container.querySelector('.wf-popover')
    console.log('after patch: overlay=', !!hasOverlay, 'panel=', !!hasPanel)
    assert.ok(hasOverlay, 'patch 后 DOM 中应有 .wf-popover-overlay')
    assert.ok(hasPanel, 'patch 后 DOM 中应有 .wf-popover')
  })

  it('通过 patchValue 模拟 open → close 状态切换', () => {
    const ctx = createMockCtx()
    const container = document.createElement('div')

    const v1 = h(Popover, { content: 'hello' })
    mountVNode(container, v1, ctx)
    assert.ok(!container.querySelector('.wf-popover-overlay'))

    const v2 = h(Popover, { content: 'hello', open: true })
    const wrap = container.querySelector('.wf-popover-wrap')!
    patchValue(container, wrap, v1, v2, ctx)
    assert.ok(container.querySelector('.wf-popover-overlay'), 'open=true → overlay 应出现')
    assert.ok(container.querySelector('.wf-popover'), 'open=true → panel 应出现')

    // 关闭
    const v3 = h(Popover, { content: 'hello', open: false })
    patchValue(container, wrap, v2, v3, ctx)
    assert.ok(!container.querySelector('.wf-popover-overlay'), 'open=false → overlay 应消失')
    assert.ok(!container.querySelector('.wf-popover'), 'open=false → panel 应消失')
  })
})
