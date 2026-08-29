/**
 * weifuwu/components — Popover
 *
 * 命令式弹窗（一个形态——ctx.ui.openPopup——toast 心智）：click/hover 双触发
 * （hover 触屏自动降级 tap）+ 受控 open + 外部点击（document 级，取代原 overlay）
 * + 定位/视口 clamp + Escape。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'
import type { Placement } from '../../vdom/hooks/popup.ts'

export type PopoverPosition = Placement

export interface PopoverProps {
  content?: any
  trigger?: 'click' | 'hover'
  position?: PopoverPosition
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: any
}

export const Popover: Component<PopoverProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let latestPosition: PopoverPosition = 'bottom'
  let latestTrigger: 'click' | 'hover' = 'click'
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  // useOpen：受控/非受控 open 统一（warn 缺回调——受控纪律自动化）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null

  // 触发（click 切换 / hover 延迟——原 usePopup wrapProps 逻辑内联）
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const clearHover = (): void => {
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null }
  }
  const hoverOpen = (): void => {
    clearHover()
    if (disabled) return
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (!openCtrl?.open) openCtrl?.setOpen(true)
    }, 0)
  }
  const hoverClose = (): void => {
    clearHover()
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (openCtrl?.open) openCtrl?.setOpen(false)
    }, 0)
  }
  ctx.ui.onUnmount?.(clearHover)
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  // ── render（每次 dirty/props 变化）──
  return (props: PopoverProps) => {
    const { content, position = 'bottom', trigger = 'click', children } = props
    latestPosition = position
    latestTrigger = trigger
    openCtrl = ctx.ui.useOpen({ open: props.open, onOpenChange: props.onOpenChange, name: 'Popover' })
    disabled = !!props.disabled

    const popover = h('div', {
      class: `wf-popover wf-popover--${position} wf-popover--enter`,
      role: 'tooltip',
    }, [
      h('div', { class: 'wf-popover-arrow' }),
      h('div', { class: 'wf-popover-content' }, content),
    ])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (openCtrl?.open && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,
        placement: () => latestPosition,
        gap: 6,
        content: () => popover,
        onClose: () => { handle = null; openCtrl?.setOpen(false) },
      })
    else if (!openCtrl?.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(popover)

    return h('div', {
      class: `wf-popover-wrap${openCtrl?.open ? ' wf-popover-wrap--open' : ''}`,
      ref: wrapRef,
      'aria-haspopup': 'dialog',
      'aria-expanded': String(!!openCtrl?.open),
      onClick: (e: Event) => { e.stopPropagation?.(); openCtrl?.setOpen(!openCtrl.open) }, // click 触发（hover 触屏降级 tap）
      ...(latestTrigger === 'hover'
        ? { onMouseEnter: hoverOpen, onMouseLeave: hoverClose }
        : {}),
    }, children)
  }
}
