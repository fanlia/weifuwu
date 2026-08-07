/**
 * weifuwu/components — Modal
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import { lockScroll, unlockScroll } from '../../client/scroll-lock.ts'
import { trapFocus } from '../../client/focus-trap.ts'

export interface ModalProps {
  open?: boolean
  title?: string
  onClose?: () => void
  children?: any
  footer?: any
  /** 自定义宽度，如 '500px'、'80%'，默认 400px */
  width?: string
  /** 是否显示关闭按钮，默认 true */
  closable?: boolean
  /** 点击遮罩是否关闭，默认 true（危险确认应设 false） */
  maskClosable?: boolean
}

export const Modal: Component<ModalProps> = (_props, ctx) => {
  // 退场状态机：open → exit（挂 --exit 类播动画）→ animationend → closed（返回 null）
  let phase: 'closed' | 'open' | 'exit' = 'closed'
  let focusCleanup: (() => void) | undefined
  let animEndHandler: (() => void) | undefined

  const finishExit = () => {
    phase = 'closed'
    ctx.ui.render()
  }

  const rootRef = (el: any) => {
    if (el) {
      lockScroll()
      const modalEl = el.querySelector('.wf-modal') ?? el
      focusCleanup = trapFocus(modalEl as HTMLElement)
      // 挂载期挂一次 animationend：enter 结束忽略，exit 结束才真正卸载
      if (!animEndHandler) {
        animEndHandler = () => { if (phase === 'exit') finishExit() }
        el.addEventListener('animationend', animEndHandler)
      }
    } else {
      unlockScroll()
      focusCleanup?.()
      el?.removeEventListener('animationend', animEndHandler as any)
      animEndHandler = undefined
    }
  }

  return (props: ModalProps) => {
    const { open, title, onClose, children, footer, width, closable = true, maskClosable = true } = props
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}

    if (open) phase = 'open'
    else if (phase === 'open') phase = 'exit'

    if (phase === 'closed') return null

    const overlay = h('div', {
      class: 'wf-modal-overlay',
      // 遮罩点击关闭：危险确认（maskClosable=false）下禁用，防误触
      onClick: maskClosable ? onClose : undefined,
    })

    const closeBtn = closable ? h('button', {
      class: 'wf-modal-close',
      onClick: onClose,
      type: 'button',
      'aria-label': ML.closeAria ?? '关闭',
    }, h(Icon, { name: 'close' })) : null

    const titleEl = title
      ? h('div', { class: 'wf-modal-header' }, [title, closeBtn].filter(Boolean))
      : null

    const bodyEl = h('div', { class: 'wf-modal-body' }, children)
    const footerEl = footer
      ? h('div', { class: 'wf-modal-footer' }, footer)
      : null

    const content = h('div', {
      class: 'wf-modal-content',
      onClick: (e: Event) => e.stopPropagation(),
      style: width ? { minWidth: width, maxWidth: width } : undefined,
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      ref: rootRef,
      class: `wf-modal ${phase === 'exit' ? 'wf-modal--exit' : 'wf-modal--enter'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
      // Escape 关闭：焦点被 trap 在对话框内，keydown 冒泡到根节点
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() },
    }, [overlay, content])

    return createPortal(root, 'modal')
  }
}
