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
export const Command: Component<CommandProps> = (_init, ctx) => {
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
  // 命令式弹窗（唯一形态 openPopup）：mask 全屏遮罩（§5.4 统一——全屏模态）——
  // 受控 open/onOpenChange；Escape/遮罩点击关闭内核内置
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncCommand = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (latest.open && panel && !handle)
      handle = ctx.ui.openPopup({
        key: 'command',
        mask: true,
        maskCentered: true,
        content: () => panel,
        onClose: () => { handle = null; if (latest.open) latest.onOpenChange?.(false) },
      })
    else if (!latest.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(panel)
  }
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  return (props) => {
    const {
      open, onOpenChange, items = [], placeholder = '输入命令或搜索...',
      emptyText = '无匹配结果', globalShortcut = 'mod+k',
    } = props
    latest = { open, onOpenChange, shortcut: globalShortcut }

    if (!open) {
      // 关闭：命令式同步（open false → 内核自动清空）
      syncCommand(null)
      return null
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

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    syncCommand(panel)
    return null
  }
}
