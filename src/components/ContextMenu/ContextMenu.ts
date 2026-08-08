import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

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

/** 右键菜单（对应 shadcn ContextMenu）：右键在光标处弹出，点击外部/Escape 关闭，方向键导航 */
export const ContextMenu: Component<ContextMenuProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let show = false
  let x = 0
  let y = 0
  let highlight = 0
  let wrapEl: HTMLElement | null = null

  const close = () => {
    if (show) {
      show = false
      ctx.ui.render()
    }
  }

  const onDocClick = () => close()
  const onDocContext = (e: Event) => { if (e.target !== wrapEl && !wrapEl?.contains(e.target as Node)) close() }
  const onDocKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }

  const stableRef = (el: HTMLElement | null) => {
    if (el) {
      wrapEl = el
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('contextmenu', onDocContext)
      document.addEventListener('keydown', onDocKey)
    } else {
      wrapEl = null
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('contextmenu', onDocContext)
      document.removeEventListener('keydown', onDocKey)
    }
  }

  return (props) => {
    const { items = [], children, 'aria-label': ariaLabel, className } = props

    const openAt = (e: any) => {
      e.preventDefault()
      // 视口夹紧（菜单约 180×N，粗估；真浏览器用菜单实际尺寸，这里取估算）
      const menuW = 180
      const menuH = Math.min(items.length * 36 + 8, 400)
      x = Math.min(e.clientX, window.innerWidth - menuW)
      y = Math.min(e.clientY, window.innerHeight - menuH)
      highlight = items.findIndex(i => !i.disabled)
      show = true
      ctx.ui.render()
    }

    const menuKeyDown = (e: any) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        for (let i = 1; i <= items.length; i++) {
          const idx = (highlight + i) % items.length
          if (!items[idx].disabled) { highlight = idx; ctx.ui.render(); break }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        for (let i = 1; i <= items.length; i++) {
          const idx = (highlight - i + items.length) % items.length
          if (!items[idx].disabled) { highlight = idx; ctx.ui.render(); break }
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

    const menu = show ? createPortal(
      h('div', {
        class: 'wf-context-menu',
        style: { left: `${x}px`, top: `${y}px` },
        role: 'menu',
        'aria-label': ariaLabel,
        onKeyDown: menuKeyDown,
      }, menuItems),
      'popover',
    ) : null

    return h('div', {
      class: ['wf-context-menu-trigger', className].filter(Boolean).join(' '),
      ref: stableRef,
      onContextMenu: openAt,
    }, [children, menu].filter(Boolean))
  }
}
