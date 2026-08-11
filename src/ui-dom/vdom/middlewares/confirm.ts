/**
 * vdom/middlewares/confirm — 命令式 confirm（vdom 引擎版）
 *
 * 注入 ctx.confirm(message, options?) → Promise<boolean>。
 * CommandConfirm 包装组件驱动 open（$ 响应式）：finish 置 false → Modal 退场
 * 状态机自播动画并卸载（portal DOM 随卸载移除）。vdom scheduler 精准刷新。
 */

import type { WfuiContext } from '../../types.ts'
import { h, type VNode } from '../../vnode.ts'
import { Confirm, type ConfirmProps } from '../../../components/Confirm/Confirm.ts'
import { createClientBrowser } from '../../browser.ts'
import { mountCommand, unmountCommand } from './host.ts'

/** 命令式 ctx.confirm 的选项 */
export interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  variant?: 'primary' | 'danger' | 'success' | 'warning'
  width?: number
  maskClosable?: boolean
}

/** 命令式 ctx.confirm 的注入类型 */
export interface ConfirmInjected {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

export function confirm(): (ctx: WfuiContext) => WfuiContext & ConfirmInjected {
  return (ctx: WfuiContext) => {
    ;(ctx as any).confirm = (message: string, options?: ConfirmOptions) =>
      createConfirm(message, options ?? {}, ctx)
    return ctx as WfuiContext & ConfirmInjected
  }
}

function createConfirm(message: string, options: ConfirmOptions, ctx: WfuiContext): Promise<boolean> {
  return new Promise(resolve => {
    const browser = createClientBrowser()
    const container = browser.createElement('div') as HTMLDivElement | null
    if (!container) { resolve(false); return }
    browser.bodyAppend(container)

    let settled = false
    let doFinish: ((result: boolean) => void) | undefined
    let hostVnode: VNode | null = null

    const CommandConfirm: any = async (_init: any, c: any) => {
      const $ = c.ui.$()
      $.open = true
      doFinish = (result: boolean) => {
        if (settled) return
        settled = true
        $.open = false
        resolve(result)
        // 容器清理：退场动画结束（animationend）或兜底 600ms 后——两者以先者为准
        const cleanup = () => { if (hostVnode) unmountCommand(container, hostVnode, ctx) }
        const el = browser.query('#__wf_portal .wf-modal')
        if (el && typeof el.addEventListener === 'function') {
          let done = false
          const once = () => { if (!done) { done = true; cleanup() } }
          el.addEventListener('animationend', once, { once: true })
          browser.timeout(once, 600)
        } else {
          cleanup()
        }
      }
      // 总是返回包装 div（非 null）：Confirm→Modal 输出是 Portal，无本地 DOM——
      // _refNode 为 null 时 renderByIds 静默跳过，open=false 永远打不进去（ToastHost 同款）
      return () => h('div', { class: 'wf-confirm-host' }, h(Confirm, {
        open: $.open,
        title: options.title,
        message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: options.variant,
        width: options.width,
        maskClosable: options.maskClosable, // 默认 false：遮罩不取消
        onConfirm: () => doFinish?.(true),
        onCancel: () => doFinish?.(false),
      } as ConfirmProps))
    }

    hostVnode = h(CommandConfirm, {})
    mountCommand(container, hostVnode, ctx)
  })
}
