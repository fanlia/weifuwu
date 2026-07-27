import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tooltip } from './Tooltip.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(show = false): WfuiContext {
  return { ui: { $: { show }, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tooltip', () => {
  it('renders children', () => {
    const vnode = Tooltip({ content: '保存', children: '按钮' }, mockCtx())!
    assert.match(vnode.props.class, /wf-tooltip-wrap/)
    assert.equal(vnode.props.children[0], '按钮')
  })

  it('does not show tooltip when $.show is false', () => {
    const vnode = Tooltip({ content: '保存', children: '按钮' }, mockCtx(false))!
    const children = vnode.props.children
    // Only children, no tooltip div
    assert.equal(children.length, 1)
    assert.equal(children[0], '按钮')
  })

  it('shows tooltip when $.show is true', () => {
    const vnode = Tooltip({ content: '保存', children: '按钮' }, mockCtx(true))!
    const children = vnode.props.children
    assert.equal(children.length, 2)
    const tip = children[1]
    assert.match(tip.props.class, /wf-tooltip/)
    assert.equal(tip.props.role, 'tooltip')
    const content = tip.props.children[1]
    assert.equal(content.props.children, '保存')
  })

  it('renders with different positions', () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const vnode = Tooltip({ content: '提示', children: 'x', position: pos }, mockCtx(true))!
      const tip = vnode.props.children[1]
      assert.match(tip.props.class, new RegExp(`wf-tooltip--${pos}`))
    }
  })

  it('does not show when disabled even if $.show is true', () => {
    const vnode = Tooltip({ content: '提示', children: 'x', disabled: true }, mockCtx(true))!
    assert.equal(vnode.props.children.length, 1)
  })

  it('has event handlers on wrapper', () => {
    const vnode = Tooltip({ content: '提示', children: 'x' }, mockCtx())!
    assert.equal(typeof vnode.props.onMouseEnter, 'function')
    assert.equal(typeof vnode.props.onMouseLeave, 'function')
    assert.equal(typeof vnode.props.onFocus, 'function')
    assert.equal(typeof vnode.props.onBlur, 'function')
  })
})
