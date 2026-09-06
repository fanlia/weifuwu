/** Modal：自定义宽度 + closable 控制关闭按钮（showcase /components/modal） */
/**
 * weifuwu/components — Modal
 *
 * 行为面（2027-09 分层抽象 W2）：openPopup 生命周期/焦点 trap/滚动锁/Esc/
 * 遮罩点击 → useOverlay 契约（手搓面消除——行为正确性结构性保证）。
 * 组件只写皮：overlay（遮罩）+ content（面板）+ 关闭按钮/标题/footer。
 */

import type {Component, VNodeChild} from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface ModalProps {
  open?: boolean
  title?: string
  onClose?: ()=> void
  children?: VNodeChild
  footer?: VNodeChild
  /** 自定义宽度，如 '500px'、'80%'，默认 400px */
  width?: string
  /** 是否显示关闭按钮，默认 true */
  closable?: boolean
  /** 点击遮罩是否关闭，默认 true（危险确认应设 false） */
  maskClosable?: boolean
}

export const Modal: Component<ModalProps> = (_props, ctx)=> {
  // 行为契约（mount 期闭包——maskProps/panelProps/close/sync）
  // positioning 'none'：.wf-modal 自己 inset:0 居中（CSS flex——不依赖锚点坐标）
  const ov = ctx.ui.useOverlay({ role: 'dialog' })

  return (props: ModalProps)=> {
    const { open, title, onClose, children, footer, width, closable = true, maskClosable = true } = props
    const ML = ctx?.i18n?.components?.Modal ?? {}

    const overlay = h('div', {
      ...ov.maskProps,
      class: 'wf-modal-overlay',
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
      onClick: (e: Event)=> e.stopPropagation(),
      style: width ? { minWidth: `min(${width}, calc(100vw - 32px))`, maxWidth: `min(${width}, calc(100vw - 32px))` } : undefined,
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      ...ov.panelProps,
      class: `wf-modal ${open ? 'wf-modal--enter' : 'wf-modal--exit'}`,
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
    }, [overlay, content])

    // 渲染期同步（openPopup 生命周期——受控 + 内容更新——每次渲染恒调用）
    ov.sync(()=> root, {
      open: !!open,
      onOpenChange: (v)=> { if (!v) onClose?.() },
      maskClosable,
      presence: true,
    })

    return null
  }
}
