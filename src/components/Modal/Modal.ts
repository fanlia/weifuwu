/**
 * weifuwu/components — Modal
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h, createPortal } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

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

export const Modal: Component<ModalProps> = async (_props, ctx) => {
  // useDialog：退场状态机（open → exit → closed）+ 滚动锁 + 焦点 trap + animationend 卸载
  const dialog = ctx.ui.useDialog({ name: 'Modal' })
  // ESC 关闭（document 级——焦点在 trap 外也可关闭；phase=open 才触发避免 exit 期间重复）
  let latestOnClose: (() => void) | undefined
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && dialog.phase === 'open') latestOnClose?.()
  })

  return (props: ModalProps) => {
    const { open, title, onClose, children, footer, width, closable = true, maskClosable = true } = props
    latestOnClose = onClose
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}
    const phase = dialog.sync(!!open)
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
      ref: dialog.panelRef,
      onClick: (e: Event) => e.stopPropagation(),
      style: width ? { minWidth: `min(${width}, calc(100vw - 32px))`, maxWidth: `min(${width}, calc(100vw - 32px))` } : undefined,
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      ref: dialog.rootRef,
      class: `wf-modal ${phase === 'exit' ? 'wf-modal--exit' : 'wf-modal--enter'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
      // Escape 关闭：document 级（useGlobalKey——mount 层注册）——不再依赖焦点 trap 冒泡
    }, [overlay, content])

    return createPortal(root, 'modal')
  }
}
