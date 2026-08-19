/**
 * vdom hooks — observe（事件驱动响应式 hooks：useScrollPosition/useInView）
 *
 * 设计（AGENTS §4.2——hooks 是事件驱动重渲染——浏览器事件 → render——
 * 与 $ 的「赋值自动」本质不同）：
 * - useScrollPosition：全局 scroll + rAF 节流——y 响应式（视口/内部容器
 *   通用）——scroll 事件 → 重渲染——unmount 清理
 * - useInView：IntersectionObserver——isIn 响应式——IO 回调 → 重渲染——
 *   unmount disconnect；环境无 IO（jsdom）→ 恒 false（测试注入 mock）
 * - **目标元素未挂载**（首帧 ref 未就绪）→ 微任务重试注册（限次——防无限）
 *
 * 浏览器能力经 env.getBrowser()（零全局直接访问——AGENTS §5.5）。
 */

import type { HookEnv } from './env.ts'

/** useScrollPosition 结果（y 响应式——滚动位置） */
export interface ScrollPosition {
  y: number
  x: number
}

interface ScrollState {
  y: number
  x: number
  raf: number | null
  handler: ((e: Event) => void) | null
  retries: number
}

/** 滚动位置跟踪（视口或内部容器——rAF 节流——事件驱动重渲染） */
export function useScrollPosition(
  env: HookEnv,
  target?: HTMLElement | (() => HTMLElement | null),
): ScrollPosition {
  const idx = env.nextHookIndex()
  const state = env.getHookState<ScrollState>(idx) ?? { y: 0, x: 0, raf: null, handler: null, retries: 0 }
  env.setHookState(idx, state)
  const win = env.getBrowser()?.window
  if (!win) return { y: 0, x: 0 }

  const getEl = (): HTMLElement | null => (typeof target === 'function' ? target() : target ?? null)

  /** 注册（目标元素未挂载 → 微任务重试——限次） */
  const ensureRegistered = (): void => {
    if (state.handler) return
    const el = getEl()
    const scroller: HTMLElement | Window = el ?? win
    if (!el) {
      if (state.retries++ < 10) env.scheduleAfterRender(ensureRegistered)
      return
    }
    const onScroll = (): void => {
      if (state.raf) return
      state.raf = win.requestAnimationFrame(() => {
        state.raf = null
        state.y = el ? el.scrollTop : (win.scrollY || 0)
        state.x = el ? el.scrollLeft : (win.scrollX || 0)
        env.requestRender()
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true } as never)
    state.handler = onScroll
    env.onUnmount(() => {
      if (state.raf) win.cancelAnimationFrame(state.raf)
      scroller.removeEventListener('scroll', onScroll)
      state.handler = null
    })
  }
  ensureRegistered()
  return {
    get y() { return state.y },
    get x() { return state.x },
  }
}

/** useInView 结果（isIn 响应式——可见性） */
export interface InView {
  isIn: boolean
}

interface InViewState {
  isIn: boolean
  io: { disconnect: () => void } | null
  retries: number
}

type IoCtor = new (cb: (entries: Array<{ isIntersecting: boolean }>) => void) => {
  observe: (el: Element) => void
  disconnect: () => void
}

/** 可见性观察（IntersectionObserver——IO 回调 → 重渲染——环境无 IO → 恒 false） */
export function useInView(
  env: HookEnv,
  target: HTMLElement | (() => HTMLElement | null),
): InView {
  const idx = env.nextHookIndex()
  const state = env.getHookState<InViewState>(idx) ?? { isIn: false, io: null, retries: 0 }
  env.setHookState(idx, state)
  const win = env.getBrowser()?.window as (Window & { IntersectionObserver?: IoCtor }) | null
  const IO = win?.IntersectionObserver
  if (IO && !state.io) {
    const el = typeof target === 'function' ? target() : target
    if (el) {
      const io = new IO((entries) => {
        const e = entries[0]
        if (e && e.isIntersecting !== state.isIn) {
          state.isIn = e.isIntersecting
          env.requestRender()
        }
      })
      io.observe(el)
      state.io = io
      env.onUnmount(() => state.io?.disconnect())
    } else if (state.retries++ < 10) {
      env.scheduleAfterRender(() => {
        // 挂载后重试（限次——防无限微任务循环）
        const el2 = typeof target === 'function' ? target() : target
        if (el2 && !state.io) {
          const io = new IO((entries) => {
            const e = entries[0]
            if (e && e.isIntersecting !== state.isIn) {
              state.isIn = e.isIntersecting
              env.requestRender()
            }
          })
          io.observe(el2)
          state.io = io
          env.onUnmount(() => state.io?.disconnect())
        }
      })
    }
  }
  return {
    get isIn() { return state.isIn },
  }
}
