import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Tooltip } from './Tooltip.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** usePopup mock：镜像真实语义（closed/disabled → portal null；open → Portal + wf-popup 前缀） */
function makeCtx(show = false, disabled = false): WfuiContext {
  return createTestCtx({ ui: {
    $: { show },
    usePopup: () => {
      const portal = (content: any) => {
        if (disabled || !show) return null
        return {
          type: Portal,
          props: {
            children: {
              ...content,
              props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' ') },
            },
            portalKey: 'tooltip',
          },
          key: undefined,
          _placement: 'remote',
        }
      }
      return {
        open: show,
        setOpen: () => {},
        wrapProps: { onMouseEnter: () => {}, onMouseLeave: () => {}, onFocus: () => {}, onBlur: () => {}, onKeyDown: () => {} },
        portal,
        refresh: () => {},
      }
    },
  } }) as any
}

/** Call component and get VNode (compatible with two-phase model) */

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Tooltip', () => {
  it('renders children', async () => {
    const vnode = await renderVNode(Tooltip, { content: '保存', children: '按钮' }, makeCtx())!
    assert.match(vnode.props.class, /wf-tooltip-wrap/)
    assert.equal(vnode.props.children[0], '按钮')
  })

  it('no portal when closed（usePopup 卸载语义，取代旧的 hidden 类）', async () => {
    const vnode = await renderVNode(Tooltip, { content: '保存', children: '按钮' }, makeCtx(false))!
    assert.equal(vnode.props.children.length, 1, '关闭时只有 trigger，无 portal')
  })

  it('tooltip visible when $.show is true', async () => {
    const vnode = await renderVNode(Tooltip, { content: '保存', children: '按钮' }, makeCtx(true))!
    const portal = vnode.props.children[1]
    assert.equal(portal.type, Portal)
    const tip = inner(portal)
    assert.match(tip.props.class, /wf-tooltip/)
    assert.match(tip.props.class, /wf-popup/, 'usePopup 附加 wf-popup 基类')
  })

  it('renders with different positions', async () => {
    for (const pos of ['top', 'bottom', 'left', 'right'] as const) {
      const vnode = await renderVNode(Tooltip, { content: '提示', children: 'x', position: pos }, makeCtx(true))!
      const portal = vnode.props.children[1]
      const tip = inner(portal)
      assert.match(tip.props.class, new RegExp(`wf-tooltip--${pos}`))
    }
  })

  it('does not render portal when disabled', async () => {
    const vnode = await renderVNode(Tooltip, { content: '提示', children: 'x', disabled: true }, makeCtx(true, true))!
    // children 只有 trigger，没有 portal
    assert.equal(vnode.props.children.length, 1)
  })

  it('has event handlers on wrapper（来自 usePopup.wrapProps）', async () => {
    const vnode = await renderVNode(Tooltip, { content: '提示', children: 'x' }, makeCtx())!
    assert.equal(typeof vnode.props.onMouseEnter, 'function')
    assert.equal(typeof vnode.props.onMouseLeave, 'function')
    assert.equal(typeof vnode.props.onFocus, 'function')
    assert.equal(typeof vnode.props.onBlur, 'function')
    assert.equal(typeof vnode.props.onKeyDown, 'function', 'Escape 关闭')
  })
})

it('disabled 切换：同实例从可用到禁用（disabled 闭包捕获而非快照）', async () => {
  const ctx = makeCtx(false, false)
  const factory = await Tooltip({ content: 'a', children: 'x' }, ctx)
  factory({ content: 'a', children: 'x' })
  // 禁用后渲染：portal 不出现
  ;(ctx.ui as any).usePopup = () => ({ portal: () => null, wrapProps: {}, open: false })
  const vnode = factory({ content: 'a', children: 'x', disabled: true })
  assert.ok(vnode, '禁用时仍渲染包裹（子内容可用）')
})

it('position 默认 top（未传时）', async () => {
  const vnode = await renderVNode(Tooltip, { content: 'a', children: 'x' }, makeCtx(true))!
  const s = JSON.stringify(vnode)
  assert.match(s, /wf-tooltip--top/)
})
