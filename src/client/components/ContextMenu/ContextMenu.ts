import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: any
  variant?: 'default' | 'danger'
  disabled?: boolean
  onClick?: () => void
}

export interface ContextMenuProps {
  items?: ContextMenuItem[]
  children: any
  'aria-label'?: string
  className?: string
}

/** 右键菜单（对应 shadcn ContextMenu）：桌面右键 / 触屏长按 在光标处弹出，点外部/Escape 关闭，方向键导航。
 * 实现：ctx.ui.usePopup（longpress 触发 + 外部点击/Escape 关闭 + 自由定位光标处 + portal 视口 clamp）——
 * 不再自建 document 监听；onTrigger 记录光标坐标，position getter 供定位。 */
export const ContextMenu: Component<ContextMenuProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let show = false
  let highlight = 0
  let wrapEl: HTMLElement | null = null
  // items 由 render 阶段更新（menuKeyDown 闭包读最新）
  let items: ContextMenuItem[] = []
  // 光标坐标（右键打开瞬间记录；position getter 供 openPopup 定位）
  let cursorX = 0
  let cursorY = 0
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null

  const close = () => { show = false; ctx.render() }
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }

  const menuKeyDown = (e: any) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      for (let i = 1; i <= items.length; i++) {
        const idx = (highlight + i) % items.length
        if (!items[idx].disabled) { highlight = idx; ctx.render(); break }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      for (let i = 1; i <= items.length; i++) {
        const idx = (highlight - i + items.length) % items.length
        if (!items[idx].disabled) { highlight = idx; ctx.render(); break }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[highlight]
      if (item && !item.disabled) {
        item.onClick?.()
        close()
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (props) => {
    const { items: propItems = [], children, 'aria-label': ariaLabel, className } = props
    items = propItems

    const menuItems = items.map((item, i) =>
      h('button', {
        type: 'button',
        class: [
          'wf-context-menu-item',
          item.variant === 'danger' ? 'wf-context-menu-item--danger' : '',
          item.disabled ? 'wf-context-menu-item--dis' : '',
          highlight === i ? 'wf-context-menu-item--hl' : '',
        ].filter(Boolean).join(' '),
        key: item.key,
        role: 'menuitem',
        disabled: item.disabled || undefined,
        onClick: item.disabled ? undefined : () => { item.onClick?.(); close() },
        onMouseEnter: () => { if (!item.disabled) { highlight = i } },
      }, item.icon ? [item.icon, h('span', {}, item.label)] : item.label)
    )

    const menu = h('div', {
      class: 'wf-context-menu',
      role: 'menu',
      'aria-label': ariaLabel,
      onKeyDown: menuKeyDown,
    }, menuItems)

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (show && !handle)
      handle = ctx.ui.openPopup({
        position: () => ({ x: cursorX, y: cursorY }),
        content: () => menu,
        closeOnOutside: true, // document mousedown（含右键别处——mousedown 先于 contextmenu 触发）
        closeOnEscape: true,
        onClose: () => { handle = null; if (show) { show = false; ctx.render() } },
      })
    else if (!show && handle) { handle.close(); handle = null }
    else if (handle) handle.update(menu)

    return h('div', {
      class: ['wf-context-menu-trigger', className].filter(Boolean).join(' '),
      ref: wrapRef,
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault()
        cursorX = e.clientX
        cursorY = e.clientY
        highlight = items.findIndex(i => !i.disabled)
        show = true
        ctx.render()
      }, // 右键触发（含触屏长按兼容）
    }, children)
  }
}
