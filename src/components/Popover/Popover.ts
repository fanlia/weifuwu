/**
 * weifuwu/components — Popover
 *
 * 通用弹出层组件。触发点击后在目标元素附近弹出浮动面板。
 * 点击面板外部关闭。
 *
 * 触发方式:
 *   'click' — 点击触发元素切换显示
 *   'hover' — 悬停触发元素显示，移出关闭
 *
 * 受控模式:
 *   传入 open + onOpenChange 可外部控制显示状态
 *   （Dropdown 使用此模式）
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type PopoverPosition = 'top' | 'bottom' | 'left' | 'right'

export interface PopoverProps {
  content?: any
  trigger?: 'click' | 'hover'
  position?: PopoverPosition
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: any
}

export const Popover: Component<PopoverProps> = (props, ctx) => {
  const {
    content,
    trigger = 'click',
    position = 'bottom',
    open,
    onOpenChange,
    disabled,
    children,
  } = props

  const $ = ctx.ui.$
  if (!ctx.ui.ready) {
    $.show = false
  }

  // 受控/非受控模式
  const isOpen = open !== undefined ? open : $.show
  const setOpen = (v: boolean) => {
    if (open === undefined) $.show = v
    onOpenChange?.(v)
  }

  // 点击触发
  const onClick = trigger === 'click' && !disabled
    ? () => setOpen(!isOpen)
    : undefined

  // 悬停触发
  const hoverProps: Record<string, any> = {}
  if (trigger === 'hover' && !disabled) {
    hoverProps.onMouseEnter = () => setOpen(true)
    hoverProps.onMouseLeave = () => setOpen(false)
    hoverProps.onFocus = () => setOpen(true)
    hoverProps.onBlur = () => setOpen(false)
  }

  // 透明遮罩 — 捕获外部点击关闭
  const overlay = isOpen
    ? h('div', {
        class: 'wf-popover-overlay',
        onMouseDown: () => setOpen(false),
      })
    : null

  // 弹出面板
  const panel = isOpen
    ? h('div', {
        class: `wf-popover wf-popover--${position}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '弹出面板',
        onMouseDown: (e: Event) => e.stopPropagation(),
      }, [
        h('div', { class: 'wf-popover-arrow' }),
        h('div', { class: 'wf-popover-content' }, content),
      ])
    : null

  return h('div', {
    class: `wf-popover-wrap${isOpen ? ' wf-popover-wrap--open' : ''}`,
    ...hoverProps,
  }, [
    h('div', { class: 'wf-popover-trigger', onClick }, children),
    overlay,
    panel,
  ].filter(Boolean))
}
