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

const EXIT_DURATION = 200

export const Modal: Component<ModalProps> = (props, ctx) => {
  const { open, title, onClose, children, footer } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.prevOpen = open; $.closing = false; $.locked = false }

  // 检测 open 从 true→false 的切换，启动退出动画
  if (!open && $.prevOpen && !$.closing) {
    $.closing = true
    setTimeout(() => { $.closing = false }, EXIT_DURATION)
  }
  // 如果在退出动画期间重新打开，取消退出
  if (open && $.closing) $.closing = false
  $.prevOpen = open

  // ScrollLock
  if (open && !$.locked) { $.locked = true; lockScroll() }
  if (!open && $.locked) { $.closing = false; unlockScroll(); $.locked = false }

  // closed 状态且无退出动画 → 不渲染
  if (!open && !$.closing) return null

  // ESC 关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) onClose()
  }

  const overlay = h('div', {
    class: 'wf-modal-overlay',
    onClick: onClose,
  })

  const closeBtn = h('button', {
    class: 'wf-modal-close',
    onClick: onClose,
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
  const modalClass = $.closing ? 'wf-modal wf-modal--exit' : 'wf-modal wf-modal--enter'

  return h('div', {
    class: modalClass,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
    onKeyDown: handleKeyDown,
    ref: (el: HTMLElement | null) => {
      if (el && open) return trapFocus(el)
    },
  }, [overlay, content])
}
