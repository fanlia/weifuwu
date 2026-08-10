/**
 * weifuwu/components — Confirm 确认对话框
 *
 * 声明式：基于 Modal 封装，footer 自带「取消 / 确定」按钮。
 * 命令式：confirm() 中间件注入 ctx.confirm()，返回 Promise<boolean>。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import type { WfuiContext, AppMiddleware } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountVNode, callRefCleanup } from '../../ui-dom/render.ts'
import { Modal } from '../Modal/Modal.ts'
import { Button } from '../Button/Button.ts'

// 命令式 API：浏览器环境（SSR 不调用）
const browser = createClientBrowser()

export interface ConfirmProps {
  open?: boolean
  title?: string
  /** 提示内容（文本或任意 VNode） */
  message?: any
  confirmText?: string
  cancelText?: string
  variant?: 'primary' | 'danger'
  /** 对话框宽度，如 '500px'、'80%'，默认 Modal 的 400px */
  width?: string
  /** 遮罩点击是否取消（默认 false：危险操作防误触；显式传 true 可恢复） */
  maskClosable?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}

/** 命令式 ctx.confirm 的选项（ConfirmProps 的子集） */
export interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  variant?: 'primary' | 'danger'
  width?: string
  maskClosable?: boolean
}

/** 命令式 ctx.confirm 的注入类型（AppMiddleware<{}, ConfirmInjected>） */
export interface ConfirmInjected {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

/**
 * 命令式中间件：注入 ctx.confirm()
 *
 * 每次调用挂载 Confirm 组件到独立容器（mountVNode），
 * resolve 后 callRefCleanup 清理（含 Modal 的 portal DOM）+ 移除容器。
 */
export function confirm(): AppMiddleware<{}, ConfirmInjected> {
  return (ctx: WfuiContext) => {
    ;(ctx as any).confirm = (message: string, options?: ConfirmOptions) =>
      createConfirm(message, options ?? {}, ctx)
    return ctx as WfuiContext & ConfirmInjected
  }
}

function createConfirm(message: string, options: ConfirmOptions, ctx: WfuiContext): Promise<boolean> {
  return new Promise(resolve => {
    const container = browser.createElement('div') as HTMLDivElement | null
    if (!container) { resolve(false); return }
    browser.bodyAppend(container)

    let settled = false
    // 包装组件驱动 open（$ 响应式）：finish 置 false → Modal 退场状态机自播动画并卸载
    // （portal DOM 随卸载移除）。旧实现静态 open=true + 手动加 --exit 类 + 定时清理：
    // resolve 后宿主重渲染会把 modal 重挂回 portal，孤儿节点永久残留（浏览器实测）
    let doFinish: ((result: boolean) => void) | undefined
    const CommandConfirm: Component = (_init, c) => {
      const $ = c.ui.$()
      $.open = true
      doFinish = (result: boolean) => {
        if (settled) return
        settled = true
        $.open = false
        resolve(result)
        // 容器清理：退场动画结束（animationend）或兜底 600ms 后——两者以先者为准
        const cleanup = () => { callRefCleanup(vnode); container.remove() }
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
      // _refNode 为 null 时 renderByIds 静默跳过，open=false 永远打不进去（ToastHost 同款模式）
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

    const vnode = h(CommandConfirm, {})
    mountVNode(container, vnode, ctx)
  })
}

export const Confirm: Component<ConfirmProps> = (_init, _ctx) => {
  // ── render（每次 dirty/props 变化）──
  return (props: ConfirmProps) => {
    const { open = false, title, message, confirmText, cancelText, variant = 'primary', width, maskClosable = false, onConfirm, onCancel } = props
    const CL = (_ctx as any)?.i18n?.components?.Confirm ?? {}

    const footer = [
      h(Button, { variant: 'secondary', size: 'md', onClick: () => onCancel?.() },
        cancelText ?? CL.cancelText ?? '取消'),
      h(Button, { variant, size: 'md', onClick: () => onConfirm?.() },
        confirmText ?? CL.confirmText ?? '确定'),
    ]

    // Escape 关闭由 Modal 统一处理（焦点在对话框内 → 冒泡到根节点）；遮罩点击默认禁（防误触）
    return h(Modal, {
      open,
      title,
      onClose: onCancel,
      maskClosable,
      footer,
      width,
      closable: false,        // 确认对话框无关闭按钮
    }, message)
  }
}
