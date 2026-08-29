/**
 * weifuwu/components — Tooltip
 *
 * 命令式弹窗（一个形态——ctx.ui.openPopup——toast 心智）：hover 触发
 * （触屏自动降级 tap）+ 定位/视口 clamp + Escape + 外部点击关闭。
 * 移动端友好由构造保证——tap 可显、44px 命中区走 base coarse 清单。
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'
import type { Placement } from '../../vdom/hooks/popup.ts'

export type TooltipPosition = Placement

export interface TooltipProps {
  content: string
  position?: TooltipPosition
  children: any
  disabled?: boolean
}

export const Tooltip: Component<TooltipProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let show = false
  let latestPosition: TooltipPosition = 'top'
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  // hover 触发（延迟——同 usePopup trigger:'hover' 语义）
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const clearHover = (): void => {
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null }
  }
  const hoverOpen = (): void => {
    clearHover()
    if (disabled) return
    hoverTimer = setTimeout(() => { hoverTimer = null; if (!show) { show = true; ctx.render() } }, 0)
  }
  const hoverClose = (): void => {
    clearHover()
    hoverTimer = setTimeout(() => { hoverTimer = null; if (show) { show = false; ctx.render() } }, 0)
  }
  ctx.ui.onUnmount?.(clearHover)
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  // ── render（每次 dirty/props 变化）──
  return (props: TooltipProps) => {
    const { content, position = 'top', children } = props
    latestPosition = position
    disabled = !!props.disabled

    const tip = h('div', {
      class: `wf-tooltip wf-tooltip--${position}`,
      role: 'tooltip',
    }, [h('div', { class: 'wf-tooltip-arrow' }), h('div', { class: 'wf-tooltip-content' }, content)])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (show && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,
        placement: () => latestPosition,
        gap: 6,
        content: () => tip,
        onClose: () => { handle = null; if (show) { show = false; ctx.render() } },
      })
    else if (!show && handle) { handle.close(); handle = null }
    else if (handle) handle.update(tip)

    return h('div', {
      class: 'wf-tooltip-wrap',
      ref: wrapRef,
      'aria-haspopup': 'tooltip',
      onMouseEnter: hoverOpen,
      onMouseLeave: hoverClose,
      onClick: () => { show = !show; ctx.render() }, // 触屏降级 tap
    }, children)
  }
}
