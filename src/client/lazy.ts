/**
 * weifuwu/client lazy — 组件懒加载（代码分割）
 *
 * 适用于按需加载，尤其是路由级别的代码分割。
 * 配合 esbuild 的 code splitting 使用。
 *
 * ```tsx
 * import { lazy } from 'weifuwu/client'
 *
 * const AdminPage = lazy(() => import('./pages/AdminPage'))
 *
 * const routes = [
 *   { path: '/admin', component: AdminPage },
 * ]
 * ```
 *
 * 构建时需启用 esbuild code splitting：
 * ```js
 * esbuild.build({
 *   entryPoints: ['src/main.tsx'],
 *   outdir: 'dist',
 *   format: 'esm',
 *   splitting: true,
 *   jsx: 'automatic',
 *   jsxImportSource: 'weifuwu/client',
 * })
 * ```
 */

import type { Component } from './jsx-runtime.ts'
import type { WfuiContext } from './types.ts'

/** 懒加载组件加载状态 */
export type LazyStatus = 'pending' | 'loading' | 'loaded' | 'error'

export interface LazyComponentOptions {
  /** 加载中的占位内容（可选） */
  fallback?: Component
  /** 加载错误时的占位内容（可选，默认显示错误信息） */
  errorFallback?: Component
}

/**
 * 创建懒加载组件 — 首次渲染时才开始加载。
 *
 * ```tsx
 * const AdminPage = lazy(() => import('./pages/AdminPage'))
 * const Dashboard = lazy(() => import('./pages/Dashboard'), {
 *   fallback: () => <div class="p-4">加载中...</div>,
 * })
 * ```
 */
export function lazy(
  loader: () => Promise<{ default: Component } | Component>,
  options?: LazyComponentOptions,
): Component {
  let loaded: Component | null = null
  let error: Error | null = null
  let status: LazyStatus = 'pending'
  let loadingPromise: Promise<void> | null = null

  function startLoad() {
    if (status !== 'pending') return
    status = 'loading'
    loadingPromise = loader()
      .then(mod => {
        loaded = 'default' in mod ? mod.default : (mod as Component)
        status = 'loaded'
      })
      .catch((e: Error) => {
        error = e
        status = 'error'
      })
  }

  return (props: Record<string, unknown>, ctx: WfuiContext): Node => {
    // 已加载 → 直接渲染
    if (loaded) {
      return loaded(props, ctx)
    }

    // 加载失败 → 显示错误
    if (error) {
      const ErrorComp = options?.errorFallback
      if (ErrorComp) return ErrorComp(props, ctx)
      const el = document.createElement('div')
      el.textContent = `组件加载失败: ${error.message}`
      el.style.cssText = 'padding: 1rem; color: #ef4444;'
      return el
    }

    // 首次渲染时触发加载
    if (status === 'pending') {
      startLoad()
    }

    // 加载完成后触发重渲染
    if (status === 'loading' && loadingPromise) {
      loadingPromise.then(() => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('wefu:lazy-loaded'))
        }, 0)
      })
    }

    // 加载中 → 显示 fallback 或占位
    const Fallback = options?.fallback
    if (Fallback) return Fallback(props, ctx)
    const el = document.createElement('div')
    el.textContent = '加载中...'
    el.style.cssText = 'padding: 1rem; color: #6b7280;'
    return el
  }
}
