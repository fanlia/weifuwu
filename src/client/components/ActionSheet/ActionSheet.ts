/**
 * weifuwu/components — ActionSheet 动作面板（移动端底部滑出）
 *
 * 命令列表 + 取消按钮（iOS 风格）——移动端 App 常用弹层（照片选择/分享/
 * 更多操作）。与 Modal/Drawer 同款会话级模态（usePopup presence 退场状态机 +
 * 焦点 trap + 滚动锁）。
 *
 * 纪律：
 * - 受控纪律（§5.2）：open 由父控制 + onClose 必须提供
 * - 键盘：role=menu + menuitem，方向键上下移动 + Enter 选择 + Escape 关闭
 * - 选择后自动关闭（onSelect(key) + onClose()）
 * - 危险操作项 danger（--wf-color-error-text 语义文字色）
 * - 图标走 Icon 组件（IconName）或任意 VNode
 */
import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { IconName } from '../Icon/Icon.ts'
import { Icon } from '../Icon/Icon.ts'

export interface ActionSheetItem {
  key: string
  label: string
  /** 图标：IconName（内置）或任意 VNode（业务自定义） */
  icon?: IconName | any
  /** 危险操作（红色语义文字） */
  danger?: boolean
  disabled?: boolean
}

export interface ActionSheetProps {
  open: boolean
  items: ActionSheetItem[]
  /** 点击项回调（选择后组件自动关闭） */
  onSelect?: (key: string) => void
  onClose: () => void
  /** 取消按钮文案（默认「取消」） */
  cancelText?: string
  /** 可选标题（面板顶部） */
  title?: string
}

export const ActionSheet: Component<ActionSheetProps> = (_init, ctx: UIContext) => {
  // ── mount（只一次）：会话级模态（Modal/Drawer 同款四件套——presence/trap/lock/定位） ──
  let latestOpen = false
  /** 键盘焦点项（方向键移动——menu 语义） */
  let focusKey = ''
  // 命令式弹窗（唯一形态 openPopup）：presence 退场 + 焦点 trap + 滚动锁
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })
  // ESC 关闭（document 级——焦点在 trap 外也可关闭；phase=open 才触发避免 exit 期间重复）
  let latestOnClose: (() => void) | undefined
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && handle?.open && latestOpen) latestOnClose?.()
  })

  return (props: ActionSheetProps) => {
    const { open, items, onSelect, onClose, cancelText, title } = props
    latestOpen = open
    latestOnClose = onClose

    // 键盘：方向键上下 + Enter 选择（menu 语义——跳过 disabled）
    const onKeyDown = (e: KeyboardEvent) => {
      const idx = items.findIndex((i) => i.key === focusKey)
      const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (dir !== 0) {
        e.preventDefault()
        let next = -1
        for (let i = 1; i <= items.length; i++) {
          const cand = (idx + dir * i + items.length) % items.length
          if (!items[cand]?.disabled) { next = cand; break }
        }
        if (next === -1) return
        focusKey = items[next].key
        ctx.render()
        // **roving focus（menu 语义——验证实测修复 2027-XX）**：方向键必须移动
        // DOM 焦点（仅更新内部 focusKey 不可观察且被原生「Enter=点击焦点项」
        // 旁路——焦点项与 focusKey 分裂）——渲染后显式聚焦目标项（跳过 disabled）
        const target = document.querySelector<HTMLElement>(`[data-actionsheet-key="${focusKey}"]`)
        target?.focus()
        return
      }
      if (e.key === 'Enter' && focusKey) {
        const item = items.find((i) => i.key === focusKey)
        if (item && !item.disabled) {
          onSelect?.(item.key)
          onClose()
        }
      }
    }
    // 渲染期维护焦点项（render-only——面板打开默认第一项；键盘移动后更新）
    if (!items.some((i) => i.key === focusKey)) focusKey = items[0]?.key ?? ''

    const overlay = h('div', {
      class: 'wf-actionsheet-overlay',
      onClick: onClose,
    })

    const itemEls = items.map((item) => {
      const icon = typeof item.icon === 'string'
        ? h(Icon, { name: item.icon as IconName, size: 18, className: 'wf-actionsheet-icon' })
        : item.icon
      return h('button', {
        key: item.key,
        type: 'button',
        role: 'menuitem',
        'data-actionsheet-key': item.key,
        class: [
          'wf-actionsheet-item',
          item.danger ? 'wf-actionsheet-item--danger' : '',
          item.disabled ? 'wf-actionsheet-item--disabled' : '',
        ].filter(Boolean).join(' '),
        disabled: item.disabled || undefined,
        onClick: item.disabled ? undefined : () => {
          onSelect?.(item.key)
          onClose()
        },
      }, [
        icon ?? null,
        h('span', { class: 'wf-actionsheet-item-label' }, item.label),
      ])
    })

    const cancelBtn = h('button', {
      type: 'button',
      class: 'wf-actionsheet-cancel',
      onClick: onClose,
    }, cancelText ?? '取消')

    const panel = h('div', {
      class: 'wf-actionsheet-panel',
      role: 'menu',
      'aria-label': title ?? '操作面板',
      onKeyDown,
      onClick: (e: Event) => e.stopPropagation(),
    }, [
      title ? h('div', { class: 'wf-actionsheet-title' }, title) : null,
      ...itemEls,
      h('div', { class: 'wf-actionsheet-divider' }),
      cancelBtn,
    ])

    const root = h('div', {
      class: `wf-actionsheet ${open ? 'wf-actionsheet--enter' : 'wf-actionsheet--exit'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? '操作面板',
      tabIndex: -1,
    }, [overlay, panel])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (open && !handle)
      handle = ctx.ui.openPopup({
        key: 'actionsheet',
        presence: true,
        trapFocus: true,
        lockScroll: true,
        positioning: 'none',
        closeOnOutside: false,
        closeOnEscape: false,
        content: () => root,
        onClose: () => { handle = null },
      })
    else if (!open && handle) {
      // 退场：先渲染 exit class（动画）→ close（presence——animationend → dispose）
      handle.update(root)
      handle.close()
      handle = null
    }
    else if (handle) handle.update(root)

    return null
  }
}
