/**
 * weifuwu/components — Modal
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Fragment } from '../../client/vnode.ts'
import { lockScroll, unlockScroll } from '../../client/scroll-lock.ts'
import { trapFocus } from '../../client/focus-trap.ts'

export interface ModalProps {
  open?: boolean
  title?: string
  onClose?: () => void
  children?: any
  footer?: any
}

export const Modal: Component<ModalProps> = (props, ctx) => {
  const { open, title, onClose, children, footer } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.exiting = false }

  // 退出动画触发（事件回调，不在 render 中写 $）
  const startClose = () => { $.exiting = true }

  // 退出动画播完
  const onExitEnd = () => {
    $.exiting = false
    onClose?.()
  }

  // 完全关闭状态 → 不渲染
  if (!open && !$.exiting) return null

  const isClosing = $.exiting

  // ESC 关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isClosing) startClose()
  }

  // ScrollLock + FocusTrap 在 ref 中处理
  const modalRef = (el: HTMLElement | null) => {
    if (!el) return
    lockScroll()
    const cleanupFocus = trapFocus(el)
    return () => { unlockScroll(); cleanupFocus() }
  }

  const overlay = h('div', {
    class: 'wf-modal-overlay',
    onClick: isClosing ? undefined : startClose,
  })

  const closeBtn = h('button', {
    class: 'wf-modal-close',
    onClick: isClosing ? undefined : startClose,
    type: 'button',
  }, '✕')

  const titleEl = title
    ? h('div', { class: 'wf-modal-header' }, [title, closeBtn])
    : null

  const bodyEl = h('div', { class: 'wf-modal-body' }, children)

  const footerEl = footer
    ? h('div', { class: 'wf-modal-footer' }, footer)
    : null

  const content = h('div', {
    class: 'wf-modal-content',
    onClick: (e: Event) => e.stopPropagation(),
  }, [titleEl, bodyEl, footerEl].filter(Boolean))

  const ML = (ctx as any)?.i18n?.components?.Modal ?? {}
  const cls = isClosing ? 'wf-modal wf-modal--exit' : 'wf-modal wf-modal--enter'

  return h('div', {
    class: cls,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
    onKeyDown: handleKeyDown,
    onAnimationEnd: isClosing ? onExitEnd : undefined,
    ref: modalRef,
  }, [overlay, content])
}
