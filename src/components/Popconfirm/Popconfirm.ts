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

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { Placement } from '../../client/popup.ts'

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

export const Popconfirm: Component<PopconfirmProps> = (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let show = false
  let latestPosition: Placement = 'top'
  let latestOpen: boolean | undefined = _init?.open
  let latestOnOpenChange: ((v: boolean) => void) | undefined
  let latestOnConfirm: (() => void) | undefined
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: () => 'click',
    placement: () => latestPosition,
    gap: 8,
    el: () => wrapEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.ui.render() },
    open: _init?.open !== undefined ? () => !!latestOpen : undefined,
    onOpenChange: (v) => latestOnOpenChange?.(v),
    disabled: () => disabled,
  })

  const close = () => { show = false; ctx.ui.render() }

  // ── render（每次 dirty/props 变化）──
  return (props: PopconfirmProps) => {
    const {
      title, okText = '确定', cancelText = '取消', danger,
      onConfirm, onCancel, position = 'top', icon,
    } = props
    latestPosition = position
    latestOpen = props.open
    latestOnOpenChange = props.onOpenChange
    latestOnConfirm = onConfirm
    disabled = !!props.disabled

    const bubble = h('div', {
      class: `wf-popconfirm wf-popconfirm--${position}${popup.open ? ' wf-popconfirm--enter' : ' wf-popconfirm--exit'}`,
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

    return h('span', { class: 'wf-popconfirm-wrap', ref: wrapRef }, [
      props.children,
      popup.portal(
        h('div', { class: 'wf-popconfirm-overlay', onClick: () => close() }),
      ),
      popup.portal(bubble, 'wf-popconfirm'),
    ])
  }
}
