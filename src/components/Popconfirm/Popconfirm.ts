/**
 * weifuwu/components — Popconfirm 气泡确认
 *
 * 三库等价：antd Popconfirm / Element Plus Popconfirm。
 * 复用 usePopup 组合器（Popover 同级基座）——验证弹层体系可组合性：
 * 定位/portal/外部点击/Escape/视口夹紧全部继承，组件只写确认语义。
 *
 *   <Popconfirm title="确定删除？" danger onConfirm={...}>
 *     <button>删除</button>
 *   </Popconfirm>
 *
 * - 受控 open/onOpenChange；非受控点击触发
 * - 确认后自动关闭（onConfirm 后 setOpen(false)）
 * - 裁剪（CS-05）：不做气泡内表单/自定义箭头
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { Placement } from '../../ui-dom/popup.ts'

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

export const Popconfirm: Component<PopconfirmProps> = async (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let latestPosition: Placement = 'top'
  let latestOnConfirm: (() => void) | undefined
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  // useOpen：受控/非受控 open 统一（close 走 setOpen——受控通知父组件）
  let openCtrl: ReturnType<WfuiContext['ui']['useOpen']> | null = null

  const popup = ctx.ui.usePopup({
    trigger: () => 'click',
    placement: () => latestPosition,
    gap: 8,
    el: () => wrapEl,
    isOpen: () => openCtrl?.open ?? false,
    setOpen: (v) => openCtrl?.setOpen(v),
    disabled: () => disabled,
  })

  const close = () => { openCtrl?.setOpen(false) }

  // ── render（每次 dirty/props 变化）──
  return async (props: PopconfirmProps) => {
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

    return h('span', { class: 'wf-popconfirm-wrap', ref: wrapRef, 'aria-haspopup': 'dialog', 'aria-expanded': String(isOpen), ...popup.wrapProps }, [
      props.children,
      popup.portal(bubble, 'wf-popconfirm'),
    ].filter(x => x !== null && x !== undefined && x !== false))
  }
}
