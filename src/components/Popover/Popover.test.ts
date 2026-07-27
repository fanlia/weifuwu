/**
 * weifuwu/components — Popover test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Popover } from './Popover.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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
})
