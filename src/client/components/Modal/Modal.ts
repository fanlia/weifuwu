/**
 * weifuwu/components — Modal
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'

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
  // 命令式弹窗（唯一形态 openPopup）：presence 退场状态机 + 焦点 trap + 滚动锁
  // positioning 'none'：.wf-modal 自己 inset:0 居中（CSS flex——不依赖锚点坐标）
  let latestOpen = false
  let latestOnClose: (() => void) | undefined
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  // ESC 关闭（document 级——焦点在 trap 外也可关闭；open 期间才触发避免退场重复）
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && handle?.open && latestOpen) latestOnClose?.()
  })
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  return async (props: ModalProps) => {
    const { open, title, onClose, children, footer, width, closable = true, maskClosable = true } = props
    latestOnClose = onClose
    latestOpen = !!open
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}

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
      class: `wf-modal ${open ? 'wf-modal--enter' : 'wf-modal--exit'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
    }, [overlay, content])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (open && !handle)
      handle = ctx.ui.openPopup({
        key: 'modal',
        presence: true,
        trapFocus: true,
        lockScroll: true,
        positioning: 'none',
        closeOnOutside: false, // 关闭语义组件自控（overlay 点击 maskClosable）
        closeOnEscape: false,  // Escape 组件自控（useGlobalKey——危险操作差异留在组件层）
        content: () => root,
        onClose: () => { handle = null },
      })
    else if (!open && handle) {
      // 退场：先渲染 exit class（动画）→ close（presence——animationend → dispose）
      handle.update(root)
      handle.close()
      handle = null
    }
    else if (handle) handle.update(root)

    return null
  }
}
