/**
 * ErrorBoundary — 错误边界组件
 *
 * 捕获子组件渲染时的错误，展示 fallback 替代崩溃白屏。
 *
 * ```tsx
 * <ErrorBoundary fallback={<p>出错了</p>}>
 *   <UserProfile />
 * </ErrorBoundary>
 * ```
 *
 * 基于 ctx.ui._errorHandler 机制：在渲染子组件前注入错误处理器，
 * 子组件 render 抛错时设置 error → 重新渲染 fallback。
 */

import type { WfuiContext } from './types.ts'
import type { VNode } from './vnode.ts'
import type { UiInternal } from './ui.ts'

export interface ErrorBoundaryProps {
  fallback?: VNode | ((props: { error: unknown }) => VNode) | null
  children?: any
}

export function ErrorBoundary(props: ErrorBoundaryProps, ctx: WfuiContext) {
  // 用 $ 响应式状态存 error——$.error = err 自动 dirty 当前组件，
  // 绕过三态 skip（闭包变量不被框架跟踪，重渲染会复用旧输出）
  const $ = ctx.ui.$()
  $.error = null as unknown

  return (props2: ErrorBoundaryProps): VNode | null => {
    // 有错误 → 渲染 fallback
    if ($.error) {
      const fb = props2.fallback
      if (typeof fb === 'function') {
        return fb({ error: $.error })
      }
      return fb ?? null
    }

    // 注入错误处理器 → 子组件 render 出错时被捕获
    // $.error = err 自动 dirty → 重渲染（renderComponent 在 _errorHandler 存在时
    // 为 null 输出插入注释占位，确保有 DOM 锚点供 patchValue 替换为 fallback）
    const ui = ctx.ui as WfuiContext['ui'] & UiInternal
    ui._errorHandler = (err: unknown) => {
      $.error = err
    }

    const children = props2.children
    try {
      return children ?? null
    } catch (e) {
      $.error = e
      const fb = props2.fallback
      if (typeof fb === 'function') {
        return fb({ error: e })
      }
      return fb ?? null
    }
  }
}
