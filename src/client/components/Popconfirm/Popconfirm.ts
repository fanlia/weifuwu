/**
 * weifuwu/components — Popconfirm 气泡确认
 *
 * 三库等价：antd Popconfirm / Element Plus Popconfirm。
 * 复用 openPopup 内核（Popover 同级基座）——验证弹层体系可组合性：
 * 定位/portal/外部点击/Escape/视口夹紧全部继承，组件只写确认语义。
 *
 *   <Popconfirm title="确定删除？" danger onConfirm={...}>
 *     <button>删除</button>
 *   </Popconfirm>
 *
 * - 受控 open/onOpenChange；非受控点击触发
 * - 确认后自动关闭（onConfirm 后 setOpen(false)）
 * - 裁剪（CS-05，见 design/components-cuts.md）：不做气泡内表单/自定义箭头
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'
import type { Placement } from '../../vdom/hooks/popup.ts'

export interface PopconfirmProps {
  title?: any
  okText?: string
  cancelText?: string
  okType?: 'primary' | 'danger'
  /** 危险确认（默认图标换 warning 色 + 确认按钮 danger） */
  danger?: boolean
  onConfirm?: () => void
  onCancel?: () => void
  position?: Placement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  icon?: any
  children?: any
}

export const Popconfirm: Component<PopconfirmProps> = (_init, ctx: UIContext) => {
  // ── mount（只一次）──
  let latestPosition: Placement = 'top'
  let latestOnConfirm: (() => void) | undefined
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  // useOpen：受控/非受控 open 统一（close 走 setOpen——受控通知父组件）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  const close = () => { openCtrl?.setOpen(false) }

  // ── render（每次 dirty/props 变化）──
  return (props: PopconfirmProps) => {
    const {
      title, okText = '确定', cancelText = '取消', danger,
      onConfirm, onCancel, position = 'top', icon,
    } = props
    latestPosition = position
    openCtrl = ctx.ui.useOpen({ open: props.open, onOpenChange: props.onOpenChange, name: 'Popconfirm' })
    latestOnConfirm = onConfirm
    disabled = !!props.disabled

    // useOpen open getter 读最新（受控 props / 非受控内部）——气泡显隐/动效类
    const isOpen = openCtrl?.open ?? false
    const bubble = h('div', {
      class: `wf-popconfirm wf-popconfirm--${position}${isOpen ? ' wf-popconfirm--enter' : ' wf-popconfirm--exit'}`,
      role: 'dialog',
      'aria-label': String(title ?? '确认'),
    }, [
      h('div', { class: 'wf-popconfirm-title' }, [
        h('span', { class: 'wf-popconfirm-icon' },
          icon ?? h(Icon, { name: danger ? 'alert' : 'info' })),
        h('span', { class: 'wf-popconfirm-title-text' }, title),
      ]),
      h('div', { class: 'wf-popconfirm-actions' }, [
        h('button', {
          class: 'wf-popconfirm-cancel wf-btn wf-btn--secondary',
          onClick: (e: Event) => {
            e.stopPropagation()
            onCancel?.()
            close()
          },
        }, cancelText),
        h('button', {
          class: `wf-popconfirm-ok wf-btn${danger ? ' wf-btn--danger' : ' wf-btn--primary'}`,
          onClick: (e: Event) => {
            e.stopPropagation()
            onConfirm?.()
            close()
          },
        }, okText),
      ]),
    ])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (isOpen && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,
        placement: () => latestPosition,
        gap: 8,
        content: () => bubble,
        onClose: () => { handle = null; openCtrl?.setOpen(false) },
      })
    else if (!isOpen && handle) { handle.close(); handle = null }
    else if (handle) handle.update(bubble)

    return h('span', {
      class: 'wf-popconfirm-wrap', ref: wrapRef,
      'aria-haspopup': 'dialog', 'aria-expanded': String(isOpen),
      onClick: (e: Event) => { e.stopPropagation?.(); if (!disabled) openCtrl?.setOpen(!openCtrl.open) }, // click 触发
    }, props.children)
  }
}
