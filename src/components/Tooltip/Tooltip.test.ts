import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Tooltip } from './Tooltip.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(show = false): WfuiContext {
  return { ui: { $: { show }, render: () => {}, dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }), ready: true } } as any
}

/** Call component and get VNode (compatible with two-phase model) */
function renderVNode(Comp: any, props: any, ctx: WfuiContext) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Tooltip', () => {
  it('renders children', () => {
    const vnode = renderVNode(Tooltip, { content: '保存', children: '按钮' }, mockCtx())!
    assert.match(vnode.props.class, /wf-tooltip-wrap/)
    assert.equal(vnode.props.children[0], '按钮')
  })

  it('tooltip hidden when $.show is false', () => {
    const vnode = renderVNode(Tooltip, { content: '保存', children: '按钮' }, mockCtx(false))!
    const portal = vnode.props.children[1]
    const tip = inner(portal)
    assert.match(tip.props.class, /wf-tooltip--hidden/)
  })

  it('tooltip visible when $.show is true', () => {
    const vnode = renderVNode(Tooltip, { content: '保存', children: '按钮' }, mockCtx(true))!
    const portal = vnode.props.children[1]
    assert.equal(portal.type, Portal)
  })

  it('renders with different positions', () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const vnode = renderVNode(Tooltip, { content: '提示', children: 'x', position: pos }, mockCtx(true))!
      const portal = vnode.props.children[1]
      const tip = inner(portal)
      assert.match(tip.props.class, new RegExp(`wf-tooltip--${pos}`))
    }
  })

  it('does not render portal when disabled', () => {
    const vnode = renderVNode(Tooltip, { content: '提示', children: 'x', disabled: true }, mockCtx(true))!
    // children 只有 trigger，没有 portal
    assert.equal(vnode.props.children.length, 1)
  })

  it('has event handlers on wrapper', () => {
    const vnode = renderVNode(Tooltip, { content: '提示', children: 'x' }, mockCtx())!
    assert.equal(typeof vnode.props.onMouseEnter, 'function')
    assert.equal(typeof vnode.props.onMouseLeave, 'function')
    assert.equal(typeof vnode.props.onFocus, 'function')
    assert.equal(typeof vnode.props.onBlur, 'function')
  })
})
