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
import { fromEventPattern } from '../observable/index.ts'
import { useObservable } from './use-observable.ts'

/** useDragDrop 结果（拖拽属性——应用于拖拽源/放置目标） */
export interface DragDrop {
  /** 拖拽源属性（draggable + drag 事件） */
  draggableProps: { draggable: true; onDragStart: (e: DragEvent) => void; onDragEnd: (e: DragEvent) => void }
  /** 拖拽源属性别名（ui-dom 兼容——Kanban 用） */
  dragProps: { draggable: true; onDragStart: (e: DragEvent) => void; onDragEnd: (e: DragEvent) => void }
  /** 放置目标属性（onDragEnter + dragover preventDefault + drop 解析） */
  dropProps: { onDragEnter: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
}

export interface DragDropOptions {
  onDragStart?: (e: DragEvent, data?: unknown) => void
  onDragEnd?: (e: DragEvent) => void
  /** 拖入（DropZone 深度计数用——dragenter 气泡自子元素——与 dragleave 配对计数防闪烁） */
  onDragEnter?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragLeave?: (e: DragEvent) => void
  onDrop?: (e: DragEvent, data?: unknown) => void
  /** 拖拽数据（dataTransfer 传递） */
  data?: unknown
}

/** 拖拽（draggable enumerated 显式 'true'——事件回调——组件层传 data） */
export function useDragDrop(env: HookEnv, opts: DragDropOptions): DragDrop {
  const source = {
    draggable: true as const, // enumerated——field/attributes 显式 'true'
    onDragStart: (e: DragEvent) => {
      if (opts.data !== undefined) e.dataTransfer?.setData('text/plain', JSON.stringify(opts.data))
      opts.onDragStart?.(e, opts.data)
    },
    onDragEnd: (e: DragEvent) => opts.onDragEnd?.(e),
  }
  return {
    draggableProps: source,
    dragProps: source,
    dropProps: {
      onDragEnter: (e: DragEvent) => opts.onDragEnter?.(e),
      onDragOver: (e: DragEvent) => {
        e.preventDefault() // 允许放置
        opts.onDragOver?.(e)
      },
      onDragLeave: (e: DragEvent) => opts.onDragLeave?.(e),
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

/** matchMedia 解析（浏览器 window 注入优先——globalThis 兜底——SSR 无环境 → undefined） */
/** **媒体查询源缓存（per window——同窗口共享（多组件合并单监听）——
 *  跨窗口隔离（测试 FakeWindow 隔离——防污染））**：
 *  源 = fromEventPattern（change → next(最新匹配) + initial 同步首值）——
 *  幂等按引用（useObservable 层）——缓存保证多组件同 query 单源单监听 */
const mediaWindowCache = new WeakMap<object, Map<string, import('../observable/index.ts').Observable<boolean>>>()
const mediaGlobalCache = new Map<string, import('../observable/index.ts').Observable<boolean>>() // 无 window（SSR）fallback
function getMediaSource(env: HookEnv, query: string): import('../observable/index.ts').Observable<boolean> {
  const win = env.getBrowser()?.window as object | undefined
  const cache = win ? (mediaWindowCache.get(win) ?? mediaWindowCache.set(win, new Map()).get(win)!) : mediaGlobalCache
  let src = cache.get(query)
  if (!src) {
    src = fromEventPattern<boolean>(
      (next) => {
        const w = env.getBrowser()?.window as (Window & { matchMedia?: (q: string) => Mql }) | null
        const mm = w?.matchMedia?.bind(w)
          ?? ((typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : undefined) as ((q: string) => Mql) | undefined)
        const mql = mm?.(query)
        if (!mql) return
        const onChange = (): void => next(mql.matches)
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
      },
      () => {
        const w = env.getBrowser()?.window as (Window & { matchMedia?: (q: string) => Mql }) | null
        const mm = w?.matchMedia?.bind(w)
          ?? ((typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : undefined) as ((q: string) => Mql) | undefined)
        return mm ? mm(query).matches : false
      },
    )
    cache.set(query, src)
  }
  return src
}

/** 媒体查询匹配（**getter 形态——2026-08**）——返回 `() => boolean`：
 *  任何时刻调用都返回最新匹配值——mount 闭包持有 getter 永远最新——
 *  「必须在 renderFn 内调用」的调用位置规则**在 API 形状上不存在**
 *  （旧快照返回：mount 闭包读一次永不更新——契约 6 静默失效类）
 *  **登记幂等（按 query 的实例级 keyed——不依赖调用顺序）**：任意位置
 *  任意次数调用不重复监听——change → 更新 + requestRender → 重渲染
 *  **2027-08 迁移**：实现 = useObservable(媒体源缓存)——订阅/退订/重渲染
 *  统一（波次 3）——行为不变（getter 形态/幂等/SSR 恒 false） */
export function useMedia(env: HookEnv, query: string): () => boolean {
  return useObservable(env, getMediaSource(env, query), false)
}

/** 命名断点（min-width 语义——**getter 形态**——`bp()` 任何时刻最新——
 *  事件驱动重渲染——内部 useMedia 按 query 幂等登记） */
export function useBreakpoint(env: HookEnv, breakpoints: Record<string, number>): () => string {
  const entries = Object.entries(breakpoints).sort((a, b) => a[1] - b[1])
  return () => {
    let current = entries[0]?.[0] ?? 'default'
    for (const [name, width] of entries) {
      // useMedia 幂等登记（keyed）——getter 内重复遍历不重复监听
      if (useMedia(env, `(min-width: ${width}px)`)()) current = name
    }
    return current
  }
}
