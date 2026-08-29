import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

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
 * 裁剪（CS-05，见 design/components-cuts.md）：hover 展开、子菜单、可拖拽菜单。 */
export const Menubar: Component<MenubarProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let openMenu: string | null = null
  let highlight = 0
  let triggerEls: (HTMLElement | null)[] = []

  // 闭包捕获索引 + Map 缓存稳定（React useCallback 等价物）：不读 dataset（根治顺序依赖）
  const triggerRefs = new Map<number, (el: HTMLElement | null) => void>()
  const triggerRefFor = (i: number) => {
    let fn = triggerRefs.get(i)
    if (!fn) {
      fn = (el) => { if (el) triggerEls[i] = el }
      triggerRefs.set(i, fn)
    }
    return fn
  }

  // menus 由 render 阶段更新（闭包读最新）
  let menus: MenubarMenu[] = []

  // 命令式弹窗（唯一形态 openPopup）：document 级外部点击/Escape + 面板定位/
  // 视口 clamp。trigger 点击仍走自定义 toggle（多 trigger 共用一个面板）
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncPanel = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (openMenu && panel && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => {
          const i = menus.findIndex(m => m.key === openMenu)
          return i >= 0 ? triggerEls[i] : null
        },
        placement: 'bottom',
        center: false,
        gap: 4,
        content: () => panel,
        onClose: () => { handle = null; if (openMenu) close() },
      })
    else if (!openMenu && handle) { handle.close(); handle = null }
    else if (handle) handle.update(panel)
  }

  const close = () => {
    if (openMenu !== null) {
      openMenu = null
      ctx.render()
    }
  }

  const toggle = (key: string) => {
    openMenu = openMenu === key ? null : key
    highlight = 0
    ctx.render()
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
        ref: triggerRefFor(i),
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

    // 命令式弹窗（唯一形态 openPopup——openMenuData 驱动）
    const panel = openMenuData ? h('div', {
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
    )) : null

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    syncPanel(panel)

    return h('div', {
      class: 'wf-menubar',
      role: 'menubar',
      'aria-label': ariaLabel,
      onKeyDown,
    }, triggers)
  }
}
