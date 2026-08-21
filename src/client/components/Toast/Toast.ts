import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext, AppMiddleware } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'

// 命令式 API：浏览器环境（SSR 不调用）
const browser = createClientBrowser()

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  /** 此条目的自动消失时间（ms），覆盖 Toast 的默认 duration */
  duration?: number
  /** 操作按钮（如"撤销"）：点击不自动关闭，由回调自行移除 */
  action?: { label: string; onClick: () => void }
}

export interface ToastProps {
  toasts?: ToastItem[]
  onRemove?: (id: string) => void
  /** 容器位置，默认 top-right */
  position?: ToastPosition
  /** 全局默认自动消失时间（ms），0 = 不自动消失，默认 0 */
  duration?: number
  /** 最大显示条数，超出时移除最早条目，默认 0 = 不限制 */
  max?: number
}

/** 命令式 ctx.toast 的全局配置 */
export interface ToastOptions {
  position?: ToastPosition
  /** 默认自动消失时间（ms），0 = 不消失，默认 3000 */
  duration?: number
  /** 最大显示条数，超出移除最早，默认 3 */
  max?: number
}

function positionClass(pos: ToastPosition): string {
  const map: Record<ToastPosition, string> = {
    'top-right': 'wf-toast--tr',
    'top-left': 'wf-toast--tl',
    'bottom-right': 'wf-toast--br',
    'bottom-left': 'wf-toast--bl',
    'top-center': 'wf-toast--tc',
  }
  return map[pos] ?? 'wf-toast--tr'
}

export const Toast: Component<ToastProps> = async (_init, ctx) => {
  // 命令式弹窗（唯一形态 openPopup）：常驻容器（positioning 'none'——CSS 角落定位）
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null

  return async (props) => {
  const { toasts = [], onRemove, position = 'top-right', duration = 0, max = 0 } = props

  // 限制最大显示条数
  const visible = max > 0 && toasts.length > max ? toasts.slice(-max) : toasts
  const items = visible.map(t =>
    h('div', {
      class: `wf-toast wf-toast--${t.type}`,
      key: t.id,
      role: t.type === 'error' ? 'alert' : 'status',
      'aria-live': t.type === 'error' ? 'assertive' : 'polite',
      'data-id': t.id,
      'data-duration': (t.duration ?? duration) || undefined,
      onClick: onRemove ? () => onRemove(t.id) : undefined,
    }, [
      h('span', { class: 'wf-toast-icon' }, h(Icon, { name: iconFor(t.type) })),
      h('span', { class: 'wf-toast-msg' }, t.message),
      t.action
        ? h('button', {
            class: `wf-toast-action wf-toast-action--${t.type}`,
            type: 'button',
            onClick: (e: Event) => { e.stopPropagation(); t.action!.onClick() },
          }, t.action.label)
        : null,
    ].filter(Boolean))
  )

  const container = h('div', {
    class: `wf-toast-container ${positionClass(position)}`,
    'data-max': max || undefined,
  }, items)

  // 命令式同步（常驻容器——内容更新——空时关闭）
  if (visible.length > 0 && !handle)
    handle = ctx.ui.openPopup({
      key: 'toast',
      positioning: 'none',
      closeOnOutside: false, closeOnEscape: false,
      content: () => container,
      onClose: () => { handle = null },
    })
  else if (visible.length === 0 && handle) { handle.close(); handle = null }
  else if (handle) handle.update(container)
  return null
  }
}

function iconFor(type?: ToastType): IconName {
  switch (type) {
    case 'success': return 'check'
    case 'error': return 'close'
    case 'warning': return 'alert'
    case 'info': return 'info'
    default: return 'info'
  }
}

// ── 命令式中间件：ctx.toast() ────────────────────────
// 首次调用时惰性挂载 ToastHost 组件到独立容器。
// ToastHost 内部持有 $.toasts 状态（$ 赋值自动触发渲染），
// 中间件只负责桥接 add/remove + 自动消失定时器。

/** 命令式 ctx.toast 的注入类型（AppMiddleware<{}, ToastInjected>） */
export interface ToastInjected {
  toast: (message: string, type?: ToastType, duration?: number, action?: { label: string; onClick: () => void }) => void
}

