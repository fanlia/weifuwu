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
 * 子组件 render 抛错时设置 $.error → 重新渲染 fallback。
 */

import type { WfuiContext } from './types.ts'
import type { VNode } from './vnode.ts'

export interface ErrorBoundaryProps {
  fallback?: VNode | ((props: { error: unknown }) => VNode) | null
  children?: any
}

export function ErrorBoundary(props: ErrorBoundaryProps, ctx: WfuiContext): VNode | null {
  const $ = ctx.ui.$
  // 只在首次初始化，不覆盖已有的 $.error
  if (!('error' in $)) $.error = null

  // 有错误 → 渲染 fallback
  if ($.error) {
    const fb = props.fallback
    if (typeof fb === 'function') {
      return (fb as any)({ error: $.error })
    }
    return fb ?? null
  }

  // 注入错误处理器 → 子组件 render 出错时被捕获
  ;(ctx as any).ui._errorHandler = (err: unknown) => {
    $.error = err
    ctx.ui.dirty()
  }

  try {
    const result = props.children
    return result ?? null
  } catch (e) {
    $.error = e
    const fb = props.fallback
    if (typeof fb === 'function') {
      return (fb as any)({ error: e })
    }
    return fb ?? null
  }
}
