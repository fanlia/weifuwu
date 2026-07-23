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
import { _trackEffect } from './jsx-runtime.ts'
import { signal, effect } from './signal.ts'
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
  // 信号驱动的重渲染触发器 — 加载完成后 increment 触发 effect
  const tick = signal(0)

  function startLoad() {
    if (status !== 'pending') return
    status = 'loading'
    loadingPromise = loader()
      .then(mod => {
        loaded = 'default' in mod ? mod.default : (mod as Component)
        status = 'loaded'
        tick.value++ // 触发 effect 重渲染
      })
      .catch((e: Error) => {
        error = e
        status = 'error'
        tick.value++ // 触发 effect 重渲染
      })
  }

  return (props: Record<string, unknown>, ctx: WfuiContext): Node => {
    // 用 display:contents 容器 + effect 实现异步加载后的自渲染
    const el = document.createElement('div')
    el.style.display = 'contents'

    function render() {
      // 清空子节点，同时触发 MutationObserver 清理旧 effect
      while (el.lastChild) el.removeChild(el.lastChild)

      // 已加载 → 渲染真正组件
      if (loaded) {
        el.appendChild(loaded(props, ctx))
        return
      }

      // 加载失败 → 显示错误
      if (error) {
        const ErrorComp = options?.errorFallback
        if (ErrorComp) {
          el.appendChild(ErrorComp(props, ctx))
        } else {
          const errEl = document.createElement('div')
          errEl.textContent = `组件加载失败: ${error.message}`
          errEl.style.cssText = 'padding: 1rem; color: #ef4444;'
          el.appendChild(errEl)
        }
        return
      }

      // 首次渲染时触发加载
      if (status === 'pending') startLoad()

      // 加载中 → 显示 fallback 或占位
      const Fallback = options?.fallback
      if (Fallback) {
        el.appendChild(Fallback(props, ctx))
      } else {
        const loadingEl = document.createElement('div')
        loadingEl.textContent = '加载中...'
        loadingEl.style.cssText = 'padding: 1rem; color: #6b7280;'
        el.appendChild(loadingEl)
      }
    }

    // 初始渲染
    render()

    // 监听加载完成信号 — tick 变化时重渲染
    const dispose = effect(() => { tick.value; render() })
    _trackEffect(el, dispose)

    return el
  }
}
