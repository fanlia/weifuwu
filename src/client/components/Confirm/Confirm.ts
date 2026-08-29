/**
 * weifuwu/components — Confirm 确认对话框
 *
 * 声明式：基于 Modal 封装，footer 自带「取消 / 确定」按钮。
 * 命令式：confirm() 中间件注入 ctx.confirm()，返回 Promise<boolean>。
 */

import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext, AppMiddleware } from '../../vdom/index.ts'
import { h, type VNode } from '../../vdom/index.ts'
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
  /** Modal 关闭回调（Escape/遮罩——onCancel 缺省时兜底——命令式兼容） */
  onClose?: () => void
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
 * 每次调用挂载 Confirm 组件到独立容器（vdom 引擎渲染——真实组件实例——
 * Modal portal 完整工作），resolve 后清理（applier.dispose + 移除容器）。
 *
 * 真实 bug（2026-12 showcase QA）：契约注释声称命令式中间件但实现缺失——
 * showcase Confirm demo 点击按钮静默失效（ctx.confirm undefined——`?.()`
 * 跳过——无弹窗无报错）——补全实现。
 */
import { renderToStream } from '../../vdom/core/build.ts'
import { CommandApplier } from '../../vdom/core/patch/index.ts'
import { createComponentRegistry } from '../../vdom/core/node/component.ts'

export function confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const registry = createComponentRegistry()
    const applier = new CommandApplier(container, document, registry)
    let done = false
    const close = (result: boolean): void => {
      if (done) return
      done = true
      applier.dispose()
      container.remove()
      resolve(result)
    }
    // 基础 ctx（组件实例的 hooks 由 renderComponent 自动注入——Modal 内部
    // usePopup/useOpen 正常）——render/onUnmount 仅 serve 语义占位
    const ctx = {
      render: async () => {},
      onUnmount: () => {},
      data: { get: async () => undefined, set: () => {}, has: () => false },
      browser: createClientBrowser(),
    } as unknown as UIContext
    const vnode = h(Confirm, {
      open: true,
      message,
      ...options,
      onConfirm: () => close(true),
      onCancel: () => close(false),
    }) as VNode
    renderToStream(vnode, ctx, registry).pipeTo(new WritableStream({
      write(cmd) { applier.apply(cmd) },
    })).catch(() => close(false))
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
      onClose: onCancel ?? props.onClose,
      maskClosable,
      footer,
      width,
      closable: false,        // 确认对话框无关闭按钮
    }, message)
  }
}
