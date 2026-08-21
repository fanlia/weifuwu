/**
 * weifuwu/components — Dropdown
 *
 * usePopup 组合器：click 触发 + 受控 open + 外部点击/Escape（document 级，
 * 弹层在 portal 中按 Escape 也能关）+ 定位/视口 clamp + portal。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'

export interface DropdownItem {
  label: string
  value?: string
  disabled?: boolean
  variant?: 'default' | 'danger'
  onClick?: () => void
}

export interface DropdownProps {
  trigger: any
  items?: DropdownItem[]
  open?: boolean
  /** 关闭回调（面板内 Escape / 外部点击） */
  onOpenChange?: (open: boolean) => void
}

export const Dropdown: Component<DropdownProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }

  // useOpen：受控/非受控 open 统一（warn 缺回调——受控纪律自动化）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  // 键盘导航高亮（R43 W1：menu 方向键 + Enter/Home/End + disabled 跳过）
  let hl = 0
  let prevOpen = false

  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  // ── render（每次 dirty/props 变化）──
  return async (props: DropdownProps) => {
    const { trigger, items = [] } = props
    openCtrl = ctx.ui.useOpen({ open: props.open, onOpenChange: props.onOpenChange, name: 'Dropdown' })

    // 打开时高亮重置第一项（prevOpen 边沿检测——重开不记忆旧位置）
    const openNow = !!openCtrl?.open
    if (openNow && !prevOpen) hl = 0
    prevOpen = openNow

    // 菜单键盘导航（render 内定义——依赖最新 items；Escape 由 usePopup 处理）
    const onMenuKeyDown = (e: any) => {
      const k = e.key
      if (k === 'Escape') return
      const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0)
      if (!enabled.length) return
      // 当前高亮在 enabled 中的位置（钳制：无效高亮归第一个可用项）
      const pos = enabled.indexOf(hl)
      const cur = pos >= 0 ? pos : 0
      if (k === 'ArrowDown' || k === 'ArrowRight') {
        e.preventDefault(); hl = enabled[Math.min(cur + 1, enabled.length - 1)]; ctx.render()
      } else if (k === 'ArrowUp' || k === 'ArrowLeft') {
        e.preventDefault(); hl = enabled[Math.max(cur - 1, 0)]; ctx.render()
      } else if (k === 'Home') { e.preventDefault(); hl = enabled[0]; ctx.render() }
      else if (k === 'End') { e.preventDefault(); hl = enabled[enabled.length - 1]; ctx.render() }
      else if (k === 'Enter' || k === ' ') {
        const item = items[hl]
        if (item && !item.disabled) {
          e.preventDefault()
          item.onClick?.()
          openCtrl?.setOpen(false)
        }
      }
    }

    const menuItems = items.map((item, i) =>
      h('button', {
        class: [
          'wf-dropdown-item',
          item.variant === 'danger' ? ' wf-dropdown-item--danger' : '',
          i === hl && openNow ? ' wf-dropdown-item--hl' : '',
        ].filter(Boolean).join(' '),
        key: item.value ?? i, disabled: item.disabled || undefined,
        role: 'menuitem', 'aria-selected': String(i === hl && openNow),
        onClick: item.disabled ? undefined : () => { item.onClick?.() },
      }, item.label)
    )

    const menu = h('div', {
      class: 'wf-dropdown-menu', role: 'menu', onKeyDown: onMenuKeyDown,
    }, menuItems)

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (openCtrl?.open && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,
        content: () => menu,
        onClose: () => { handle = null; openCtrl?.setOpen(false) },
      })
    else if (!openCtrl?.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(menu)

    return h('div', {
      class: `wf-dropdown${openCtrl?.open ? ' wf-dropdown--open' : ''}`,
      ref: wrapRef,
      onClick: (e: Event) => { e.stopPropagation?.(); openCtrl?.setOpen(!openCtrl.open) }, // click 触发
      // 触发区语义：菜单弹出（trigger 为不透明 VNode，ARIA 挂在包装层，文档注明）
      'aria-haspopup': 'menu',
      'aria-expanded': String(!!openCtrl?.open),
    }, trigger)
  }
}
