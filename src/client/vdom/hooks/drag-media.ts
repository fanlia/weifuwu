/**
 * vdom hooks — drag/breakpoint（useDragDrop + useMedia/useBreakpoint）
 *
 * - useDragDrop：拖拽（draggable enumerated 属性显式 'true'——field/
 *   attributes 已处理；drag 事件回调——unmount 清理）
 * - useMedia：媒体查询匹配（matchMedia——change 监听 → 重渲染——
 *   经 ctx.browser.window——零全局直接访问；环境无 matchMedia → 恒 false）
 * - useBreakpoint：命名断点（min-width 语义——当前匹配的最大宽度断点）
 */

import type { HookEnv } from './env.ts'

/** useDragDrop 结果（拖拽属性——应用于拖拽源/放置目标） */
export interface DragDrop {
  /** 拖拽源属性（draggable + drag 事件） */
  draggableProps: { draggable: true; onDragStart: (e: DragEvent) => void; onDragEnd: (e: DragEvent) => void }
  /** 放置目标属性 */
  dropProps: { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
}

export interface DragDropOptions {
  onDragStart?: (e: DragEvent, data?: unknown) => void
  onDragEnd?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent, data?: unknown) => void
  /** 拖拽数据（dataTransfer 传递） */
  data?: unknown
}

/** 拖拽（draggable enumerated 显式 'true'——事件回调——组件层传 data） */
export function useDragDrop(env: HookEnv, opts: DragDropOptions): DragDrop {
  return {
    draggableProps: {
      draggable: true, // enumerated——field/attributes 显式 'true'
      onDragStart: (e: DragEvent) => {
        if (opts.data !== undefined) e.dataTransfer?.setData('text/plain', JSON.stringify(opts.data))
        opts.onDragStart?.(e, opts.data)
      },
      onDragEnd: (e: DragEvent) => opts.onDragEnd?.(e),
    },
    dropProps: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault() // 允许放置
        opts.onDragOver?.(e)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        let data: unknown
        try { data = e.dataTransfer?.getData('text/plain') ? JSON.parse(e.dataTransfer.getData('text/plain')) : undefined } catch { data = undefined }
        opts.onDrop?.(e, data)
      },
    },
  }
}

type Mql = {
  matches: boolean
  addEventListener: (t: 'change', cb: () => void) => void
  removeEventListener: (t: 'change', cb: () => void) => void
}

/** 媒体查询匹配（change 监听 → 重渲染——环境无 matchMedia → 恒 false） */
export function useMedia(env: HookEnv, query: string): boolean {
  const idx = env.nextHookIndex()
  const state = env.getHookState<{ matches: boolean; mql: Mql | null }>(idx) ?? { matches: false, mql: null }
  env.setHookState(idx, state)
  const win = env.getBrowser()?.window as (Window & { matchMedia?: (q: string) => Mql }) | null
  const mql = win?.matchMedia?.(query)
  if (mql) {
    state.matches = mql.matches
    if (!state.mql) {
      const onChange = (): void => {
        state.matches = mql.matches
        env.requestRender()
      }
      mql.addEventListener('change', onChange)
      state.mql = mql
      env.onUnmount(() => mql.removeEventListener('change', onChange))
    }
  }
  return state.matches
}

/** 命名断点（min-width 语义——当前匹配的最大宽度断点——事件驱动重渲染） */
export function useBreakpoint(env: HookEnv, breakpoints: Record<string, number>): string {
  const entries = Object.entries(breakpoints).sort((a, b) => a[1] - b[1])
  let current = entries[0]?.[0] ?? 'default'
  for (const [name, width] of entries) {
    if (useMedia(env, `(min-width: ${width}px)`)) current = name
  }
  return current
}
