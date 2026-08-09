import type { Component } from '../../client/vnode.ts'
import { createClientBrowser } from '../../client/browser.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface MenubarItem {
  key: string
  label: string
  icon?: any
  shortcut?: string
  disabled?: boolean
  onSelect?: () => void
}

export interface MenubarMenu {
  key: string
  label: string
  items?: MenubarItem[]
  disabled?: boolean
}

export interface MenubarProps {
  menus?: MenubarMenu[]
  'aria-label'?: string
}

/** 水平菜单栏（对应 shadcn Menubar）：trigger 点击展开下拉，←→ 切换菜单，Escape 关闭。
 * 裁剪：hover 展开、子菜单、可拖拽菜单。 */
export const Menubar: Component<MenubarProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback jsdom）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let openMenu: string | null = null
  let highlight = 0
  let triggerEls: (HTMLElement | null)[] = []

  // 稳定 ref：索引从 data-idx 读取（内联 ref 每次渲染换引用，会触发无谓的旧 ref(null)）
  const triggerRef = (el: HTMLElement | null) => {
    if (!el) return
    const i = Number(el.dataset.idx)
    if (!Number.isNaN(i)) triggerEls[i] = el
  }

  // menus 由 render 阶段更新（闭包读最新）
  let menus: MenubarMenu[] = []

  // usePopup：只借用 document 级外部点击/Escape + 面板定位/视口 clamp + portal。
  // trigger 点击仍走自定义 toggle（多 trigger 共用一个面板，不 spread wrapProps）
  const popup = ctx.ui.usePopup({
    trigger: 'click',
    placement: 'bottom',
    center: false,
    gap: 4,
    el: () => {
      const i = menus.findIndex(m => m.key === openMenu)
      return i >= 0 ? triggerEls[i] : null
    },
    isOpen: () => openMenu !== null,
    setOpen: (v) => { if (!v) close() },
  })

  const close = () => {
    if (openMenu !== null) {
      openMenu = null
      ctx.ui.render()
    }
  }

  const toggle = (key: string) => {
    openMenu = openMenu === key ? null : key
    highlight = 0
    ctx.ui.render()
  }

  return (props) => {
    const { menus: propMenus = [], 'aria-label': ariaLabel } = props
    menus = propMenus

    const onKeyDown = (e: any) => {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      if (openMenu) { close(); return }
      const current = (_browser?.activeElement() ?? null)
      const idx = triggerEls.indexOf(current as HTMLElement)
      if (idx < 0) return
      e.preventDefault()
      const next = e.key === 'ArrowRight'
        ? (idx + 1) % menus.length
        : (idx - 1 + menus.length) % menus.length
      triggerEls[next]?.focus()
    }

    const triggers = menus.map((menu, i) => {
      const open = openMenu === menu.key
      return h('button', {
        type: 'button',
        class: [
          'wf-menubar-trigger',
          open ? 'wf-menubar-trigger--open' : '',
          menu.disabled ? 'wf-menubar-trigger--dis' : '',
        ].filter(Boolean).join(' '),
        key: menu.key,
        'data-idx': String(i),
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        onClick: menu.disabled ? undefined : () => toggle(menu.key),
        onKeyDown: (e: any) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault()
            if (!menu.disabled) toggle(menu.key)
          }
        },
      }, menu.label)
    })

    const openMenuData = menus.find(m => m.key === openMenu)

    const panel = openMenuData ? popup.portal(h('div', {
      class: 'wf-menubar-panel',
      role: 'menu',
    }, (openMenuData.items ?? []).map((item, i) =>
      h('button', {
        type: 'button',
        class: [
          'wf-menubar-item',
          highlight === i ? 'wf-menubar-item--hl' : '',
          item.disabled ? 'wf-menubar-item--dis' : '',
        ].filter(Boolean).join(' '),
        key: item.key,
        role: 'menuitem',
        onClick: item.disabled ? undefined : () => { item.onSelect?.(); close() },
        onMouseEnter: () => { if (!item.disabled) highlight = i },
      }, [
        h('span', { class: 'wf-menubar-item-label' }, item.label),
        item.shortcut ? h('kbd', { class: 'wf-menubar-shortcut' }, item.shortcut) : null,
      ].filter(Boolean))
    )), 'popover') : null

    return h('div', {
      class: 'wf-menubar',
      role: 'menubar',
      'aria-label': ariaLabel,
      onKeyDown,
    }, [...triggers, panel].filter(Boolean))
  }
}
