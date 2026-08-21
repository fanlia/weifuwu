import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CommandItem {
  key: string
  label: string
  icon?: any
  /** 显示快捷键（如 'G S'） */
  shortcut?: string
  group?: string
  keywords?: string[]
  onSelect?: () => void
}

export interface CommandProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  items?: CommandItem[]
  placeholder?: string
  emptyText?: string
  /** 全局快捷键，如 'mod+k'（cmd/ctrl + k）；null 关闭全局监听 */
  globalShortcut?: string | null
}

/** 命令面板（对应 shadcn Command）：usePopup mask 全屏遮罩 + 搜索 + 键盘流（↑↓ Enter Escape）+ Cmd+K 全局快捷键 */
export const Command: Component<CommandProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let query = ''
  let highlight = 0
  let latest: { open?: boolean; onOpenChange?: (open: boolean) => void; shortcut?: string | null } = {}

  // 稳定 ref：每次打开时 input 重新挂载 → focus；输入变化 render 复用 DOM，不重复 focus
  // （内联 ref 每次渲染换引用，输入时会反复重新 focus 导致光标异常）
  const inputRef = (el: HTMLInputElement | null) => { if (el) queueMicrotask(() => el.focus()) }

  // 全局快捷键经 ctx.ui.useGlobalKey（window keydown：mount 注册 + 卸载清理）
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    const sc = latest.shortcut
    if (!sc) return
    const parts = sc.split('+')
    const mod = parts.includes('mod')
    const key = parts[parts.length - 1].toLowerCase()
    const modMatch = mod ? (e.ctrlKey || e.metaKey) : true
    if (modMatch && e.key.toLowerCase() === key) {
      e.preventDefault()
      latest.onOpenChange?.(!latest.open)
    }
  })

  const stableRef = (el: HTMLElement | null) => { void el }
  // 弹层组合器：mask 全屏遮罩（§5.4 统一——Command 全屏模态）——
  // 受控 open/onOpenChange；Escape/遮罩点击关闭由 usePopup 内置
  const popup = ctx.ui.usePopup?.({
    trigger: 'click',
    placement: 'bottom',
    el: () => null,
    isOpen: () => !!latest.open,
    setOpen: (v) => { if (!v) latest.onOpenChange?.(false) },
    open: () => !!latest.open,
    onOpenChange: (v) => { latest.onOpenChange?.(v) },
    mask: true,
    maskCentered: true,
  }) ?? {
    open: false, setOpen: () => {}, wrapProps: {},
    portal: () => null, refresh: () => {},
  }

  return async (props) => {
    const {
      open, onOpenChange, items = [], placeholder = '输入命令或搜索...',
      emptyText = '无匹配结果', globalShortcut = 'mod+k',
    } = props
    latest = { open, onOpenChange, shortcut: globalShortcut }

    if (!open) {
      // 关闭：**方案 B（保留 hole 槽）**——数组恒含 portal() 调用（槽恒在——
      // 引擎自动清空——组件无特殊关闭路径）
      return [popup.portal(null, 'command')]
    }

    const filtered = query
      ? items.filter(i => {
          const q = query.toLowerCase()
          return i.label.toLowerCase().includes(q) ||
            (i.keywords ?? []).some(k => k.toLowerCase().includes(q))
        })
      : items

    if (highlight >= filtered.length) highlight = Math.max(0, filtered.length - 1)

    const close = () => onOpenChange?.(false)

    const inputKeyDown = (e: any) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlight = Math.min(highlight + 1, Math.max(filtered.length - 1, 0))
        ctx.render()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlight = Math.max(highlight - 1, 0)
        ctx.render()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[highlight]
        if (item) { item.onSelect?.(); close() }
      } else if (e.key === 'Escape') {
        close()
      }
    }

    const list = filtered.length > 0
      ? filtered.map((item, i) =>
          h('button', {
            type: 'button',
            class: `wf-command-item${highlight === i ? ' wf-command-item--hl' : ''}`,
            key: item.key,
            onClick: () => { item.onSelect?.(); close() },
            onMouseEnter: () => { highlight = i },
          }, [
            item.icon ?? h(Icon, { name: 'search', size: 14 }),
            h('span', { class: 'wf-command-item-label' }, item.label),
            item.shortcut ? h('kbd', { class: 'wf-command-shortcut' }, item.shortcut) : null,
          ].filter(Boolean))
        )
      : [h('div', { class: 'wf-command-empty' }, emptyText)]

    const panel = h('div', {
      class: 'wf-command-panel',
      role: 'dialog',
      'aria-label': '命令面板',
    }, [
      h('div', { class: 'wf-command-input-wrap' }, [
        h(Icon, { name: 'search', size: 14 }),
        h('input', {
          class: 'wf-command-input',
          type: 'text',
          placeholder,
          value: query,
          onInput: (e: any) => { query = e.target.value; highlight = 0; ctx.render() },
          onKeyDown: inputKeyDown,
          ref: inputRef,
        }),
      ]),
      h('div', { class: 'wf-command-list' }, list),
    ])

    // usePopup mask 全屏遮罩 + 居中（统一管理——不再手写 overlay）
    return popup.portal(panel, 'command')
  }
}
