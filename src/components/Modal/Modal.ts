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
  // usePopup 会话级模态（统一弹窗能力）：presence 退场状态机 + 焦点 trap + 滚动锁
  // position 'none'：Modal 的 .wf-modal 自己 inset:0 居中（CSS flex——不依赖锚点坐标）
  let latestOpen = false
  const popup = ctx.ui.usePopup({
    presence: true,
    trapFocus: true,
    lockScroll: true,
    positioning: 'none',
    closeOnOutside: false, // 关闭语义组件自控（overlay 点击 maskClosable）
    closeOnEscape: false,  // Escape 组件自控（useGlobalKey——危险操作差异留在组件层）
    isOpen: () => latestOpen,
    setOpen: () => {},
  })
  // ESC 关闭（document 级——焦点在 trap 外也可关闭；phase=open 才触发避免 exit 期间重复）
  let latestOnClose: (() => void) | undefined
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && popup.phase === 'open') latestOnClose?.()
  })

  return async (props: ModalProps) => {
    const { open, title, onClose, children, footer, width, closable = true, maskClosable = true } = props
    latestOnClose = onClose
    latestOpen = !!open
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}
    const phase = popup.sync!(latestOpen)
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
      style: width ? { minWidth: `min(${width}, calc(100vw - 32px))`, maxWidth: `min(${width}, calc(100vw - 32px))` } : undefined,
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      class: `wf-modal ${phase === 'exit' ? 'wf-modal--exit' : 'wf-modal--enter'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
      // Escape 关闭：document 级（useGlobalKey——mount 层注册）——不再依赖焦点 trap 冒泡
    }, [overlay, content])

    // 焦点 trap + 滚动锁 + 退场监听由 usePopup 内部 portalPanelRef 接线（无需手动 ref）
    return popup.portal(root, 'modal')
  }
}
