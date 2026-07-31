/**
 * weifuwu/components — Confirm 确认对话框
 *
 * 声明式：基于 Modal 封装，footer 自带「取消 / 确定」按钮。
 * 命令式：confirm() 中间件注入 ctx.confirm()，返回 Promise<boolean>。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext, AppMiddleware } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { mountVNode, callRefCleanup } from '../../client/render.ts'
import { Modal } from '../Modal/Modal.ts'
import { Button } from '../Button/Button.ts'

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
}

/**
 * 命令式中间件：注入 ctx.confirm()
 *
 * 每次调用挂载 Confirm 组件到独立容器（mountVNode），
 * resolve 后 callRefCleanup 清理（含 Modal 的 portal DOM）+ 移除容器。
 */
export function confirm(): AppMiddleware {
  return (ctx: WfuiContext) => {
    ;(ctx as any).confirm = (message: string, options?: ConfirmOptions) =>
      createConfirm(message, options ?? {}, ctx)
    return ctx
  }
}

function createConfirm(message: string, options: ConfirmOptions, ctx: WfuiContext): Promise<boolean> {
  return new Promise(resolve => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let settled = false
    const vnode = h(Confirm, {
      open: true,
      title: options.title,
      message,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      variant: options.variant,
      width: options.width,
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
    } as ConfirmProps)

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      callRefCleanup(vnode)
      container.remove()
      resolve(result)
    }

    mountVNode(container, vnode, ctx)
  })
}

export const Confirm: Component<ConfirmProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let prevOpen = false
  let escCleanup: (() => void) | undefined

  // ── render（每次 dirty/props 变化）──
  return (props: ConfirmProps) => {
    const { open = false, title, message, confirmText, cancelText, variant = 'primary', width, onConfirm, onCancel } = props
    const CL = (ctx as any)?.i18n?.components?.Confirm ?? {}

    // ESC 关闭 = 取消（Modal 自身不处理 ESC，这里补）
    if (open && !prevOpen) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel?.()
      }
      document.addEventListener('keydown', onKeyDown)
      escCleanup = () => document.removeEventListener('keydown', onKeyDown)
    } else if (!open && prevOpen) {
      escCleanup?.()
      escCleanup = undefined
    }
    prevOpen = open

    const footer = [
      h(Button, { variant: 'secondary', size: 'md', onClick: () => onCancel?.() },
        cancelText ?? CL.cancelText ?? '取消'),
      h(Button, { variant, size: 'md', onClick: () => onConfirm?.() },
        confirmText ?? CL.confirmText ?? '确定'),
    ]

    return h(Modal, {
      open,
      title,
      onClose: onCancel,      // 遮罩点击 = 取消
      footer,
      width,
      closable: false,        // 确认对话框无 ✕ 关闭按钮
    }, message)
  }
}
