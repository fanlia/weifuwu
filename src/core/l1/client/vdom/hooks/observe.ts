/**
 * vdom hooks — observe（事件驱动响应式 hooks：useScrollPosition/useInView）
 *
 * 设计（设计规则 §4.2——hooks 是事件驱动重渲染——浏览器事件 → render——
 * 与 $ 的「赋值自动」本质不同）：
 * - useScrollPosition：全局 scroll + rAF 节流——y 响应式（视口/内部容器
 *   通用）——scroll 事件 → 重渲染——unmount 清理
 * - useInView：IntersectionObserver——isIn 响应式——IO 回调 → 重渲染——
 *   unmount disconnect；环境无 IO（jsdom）→ 恒 false（测试注入 mock）
 * - **目标元素未挂载**（首帧 ref 未就绪）→ 微任务重试注册（限次——防无限）
 *
 * 浏览器能力经 env.getBrowser()（零全局直接访问——设计规则 §5.5）。
 */

import type { HookEnv } from './env.ts'
import { fromEventPattern, Subject, create } from '../observable/index.ts'
import { useObservable } from './use-observable.ts'

/** useScrollPosition 选项（ui-dom 兼容对象形状——组件消费：{ getScroller }） */
export interface UseScrollPositionOptions {
  /** 滚动容器 getter（HTMLElement | Window——组件自管容器场景） */
  getScroller?: () => HTMLElement | Window | null
  /** 容器（string 选择器 / 元素） */
  root?: string | HTMLElement
}

/** useScrollPosition 结果（**对象 getter 形态**——y/x 读时求值——mount
 *  闭包持有永远最新——位置规则不存在；refresh 手动重算驱动） */
export interface ScrollPosition {
  readonly y: number
  readonly x: number
  /** 手动重算（组件调用方驱动——读当前滚动位置——不触发渲染） */
  refresh(): void
}

interface ScrollState {
  y: number
  x: number
  raf: number | null
  handler: ((e: Event) => void) | null
  retries: number
}

/** 目标解析（ui-dom 兼容：对象 { getScroller } / 字符串 / 元素 / 函数 / 缺省=窗口） */
export type ScrollTarget = HTMLElement | (() => HTMLElement | null) | string | UseScrollPositionOptions

function resolveScroller(target: ScrollTarget | undefined, win: Window, doc: Document | null): HTMLElement | Window {
  if (typeof target === 'string') {
    if (target === 'win' || target === 'window') return win
    if (doc) return (doc.querySelector(target) as HTMLElement | null) ?? win
    return win
  }
  if (target && typeof target === 'object' && !('nodeType' in target)) {
    const opts = target as UseScrollPositionOptions
    if (typeof opts.getScroller === 'function') {
      const s = opts.getScroller()
      if (s) return s
      return win
    }
    if (opts.root) {
      if (typeof opts.root === 'string') {
        if (doc) return (doc.querySelector(opts.root) as HTMLElement | null) ?? win
        return win
      }
      return opts.root
    }
    return win
  }
  return win
}

/** 滚动位置跟踪（视口或内部容器——rAF 节流——事件驱动重渲染） */
export function useScrollPosition(
  env: HookEnv,
  target?: ScrollTarget,
): ScrollPosition {
  // **2027-08 迁移（波次 3）**：实现 = useObservable(滚动源)——订阅/退订/
  // 重渲染/重试绑定全部统一——形状保留（对象 getter——调用方零改动）——
  // refresh 语义升级：手动重算 → 流 next → **自动重渲染**（此前调用方驱动）
  const refresh$ = new Subject<void>()
  const state = useObservable(env, scrollSource$(env, target, refresh$), { y: 0, x: 0 })
  return {
    get y() { return state().y },
    get x() { return state().x },
    refresh: () => { refresh$.next() }, // 手动重算——流 next——自动重渲染
  } as ScrollPosition
}

/** 滚动源（env 闭包 + 目标解析——**重试绑定防御保留**（`?? null` 语义））：
 *  scroll(容器/window——capture 捕获) + rAF 节流 → next(readPos)——
 *  目标未挂载（getScroller 返回 null）→ afterRender 重试（限 10 次）——
 *  refresh$ 信号合流（手动重算入口） */
function scrollSource$(
  env: HookEnv,
  target?: ScrollTarget,
  refresh$?: Subject<void>,
): import('../observable/index.ts').Observable<{ y: number; x: number }> {
  const win = env.getBrowser()?.window
  const doc = env.getBrowser()?.document ?? null
  return create<{ y: number; x: number }>((obs) => {
    if (!win) { obs.next({ y: 0, x: 0 }); obs.complete(); return () => {} }
    let raf: number | undefined
    let handler: ((e?: Event) => void) | null = null
    let scroller: HTMLElement | Window | null = null
    let retries = 0

    const getScroller = (): HTMLElement | Window | null => {
      if (typeof target === 'function') return target()
      if (target && typeof target === 'object' && !('nodeType' in target)) {
        const opts = target as UseScrollPositionOptions
        if (typeof opts.getScroller === 'function') return opts.getScroller() ?? null
        if (opts.root) {
          if (typeof opts.root === 'string') {
            if (doc) return (doc.querySelector(opts.root) as HTMLElement | null) ?? win
            return win
          }
          return opts.root
        }
        return win
      }
      return win
    }
    const readPos = (s: HTMLElement | Window | null): { y: number; x: number } => {
      if (!s) return { y: 0, x: 0 }
      if (s === win) return { y: win.scrollY || 0, x: win.scrollX || 0 }
      return { y: (s as HTMLElement).scrollTop, x: (s as HTMLElement).scrollLeft }
    }
    const emit = (): void => { obs.next(readPos(scroller)) }

    const ensure = (): void => {
      if (handler) return
      scroller = getScroller()
      if (!scroller) {
        // **重试绑定防御（`?? null` 语义——已修 bug 逻辑保留）**：
        // 首帧 el 未挂载 target()=null——afterRender 重试（限次——防无限）
        if (retries++ < 10) env.scheduleAfterRender(ensure)
        return
      }
      const onScroll = (): void => {
        if (raf !== undefined) return
        raf = win.requestAnimationFrame(() => {
          raf = undefined
          emit()
        })
      }
      scroller.addEventListener('scroll', onScroll, { passive: true } as never)
      handler = onScroll
      emit() // 注册即读初值
    }
    ensure()
    // **refresh = ensure + emit（2027-XX——Affix 容器级 target 实证修复）**：
    // 此前 refresh 只 emit()——目标后挂载（getScroller 首帧 null → 重试耗尽）
    // 后 refresh 永不重试绑定 → 滚动源永久丢失（容器滚动零响应）。
    // ensure 幂等（已绑定即跳过）——refresh 语义 = 重新解析目标 + 读值
    const refreshSub = refresh$?.subscribe({ next: () => { ensure(); emit() } })
    return () => {
      refreshSub?.unsubscribe()
      if (raf !== undefined) win.cancelAnimationFrame(raf)
      if (handler && scroller) scroller.removeEventListener('scroll', handler)
      handler = null
    }
  })
}

/** useInView 选项（ui-dom 兼容对象形状——组件消费：{ root, threshold, target }） */
export interface UseInViewOptions {
  /** 可见性变化回调（ui-dom 兼容——InfiniteScroll 用——双参 (entry, isIn)） */
  onChange?(entry: unknown, isIn: boolean): void
  /** 根容器（元素或渲染期 getter——ui-dom 兼容） */
  root?: HTMLElement | null | (() => HTMLElement | Element | null)
  /** 阈值（值或渲染期 getter） */
  threshold?: number | number[] | (() => number | number[])
  /** 边距（字符串或渲染期 getter——ui-dom 渲染期函数形状） */
  rootMargin?: string | (() => string)
  target?: HTMLElement | (() => HTMLElement | null)
}

/** useInView 结果（**对象 getter 形态**——isIn/ready 读时求值——mount
 *  闭包持有永远最新） */
export interface InView {
  readonly isIn: boolean
  /** 绑定 ref（el 挂载 → 观察；null → 断开） */
  ref(el: HTMLElement | null): void
  /** 手动开始观察（组件自管 el 场景——BackTop/InView） */
  observe(el: HTMLElement): void
  /** 停止观察 */
  disconnect(): void
  /** 是否已注册（BackTop 用：ready && !isIn → 显示） */
  readonly ready: boolean
}

interface InViewState {
  isIn: boolean
  io: { disconnect: () => void } | null
  retries: number
  ready: boolean
}

type IoCtor = new (cb: (entries: Array<{ isIntersecting: boolean }>) => void) => {
  observe: (el: Element) => void
  disconnect: () => void
}

/** 可见性观察（IntersectionObserver——IO 回调 → 重渲染——环境无 IO → 恒 false） */
export function useInView(
  env: HookEnv,
  options?: UseInViewOptions | HTMLElement | (() => HTMLElement | null),
): InView {
  const idx = env.nextHookIndex()
  const state = env.getHookState<InViewState>(idx) ?? { isIn: false, io: null, retries: 0, ready: false }
  env.setHookState(idx, state)
  const win = env.getBrowser()?.window as (Window & { IntersectionObserver?: IoCtor }) | null
  const IO = win?.IntersectionObserver
  // 目标解析（对象 { target } / 元素 / 函数 / 对象无 target = 组件自管 observe）
  const opts = options && typeof options === 'object' && !('nodeType' in options)
    ? options as UseInViewOptions
    : undefined
  const target = opts?.target ?? (typeof options === 'function' ? options : options && 'nodeType' in options ? options : undefined)
  // 渲染期 getter 解析（ui-dom 函数形状——rootMargin/threshold）
  const rootMargin = typeof opts?.rootMargin === 'function' ? opts.rootMargin() : opts?.rootMargin
  const threshold = typeof opts?.threshold === 'function' ? opts.threshold() : opts?.threshold
  const rootEl = typeof opts?.root === 'function' ? opts.root() as HTMLElement | null : (opts?.root ?? null)

  const startObserve = (el: HTMLElement | null): void => {
    if (!IO || !el || state.io) return
    const io = new (IO as unknown as new (cb: (entries: Array<{ isIntersecting: boolean }>) => void, opts?: Record<string, unknown>) => {
      observe: (el: Element) => void; disconnect: () => void
    })((entries) => {
      const e = entries[0]
      if (e && e.isIntersecting !== state.isIn) {
        state.isIn = e.isIntersecting
        opts?.onChange?.(e, e.isIntersecting)
        env.requestRender()
      }
    }, { root: rootEl ?? undefined, rootMargin, threshold })
    io.observe(el)
    state.io = io
    state.ready = true
    env.onUnmount(() => state.io?.disconnect())
  }

  if (IO && !state.io) {
    const el = typeof target === 'function' ? target() : (target ?? null)
    if (el) {
      startObserve(el)
    } else if (target !== undefined && state.retries++ < 10) {
      env.scheduleAfterRender(() => startObserve(typeof target === 'function' ? target() : (target ?? null)))
    }
  }
  return {
    get isIn() { return state.isIn },
    get ready() { return state.ready },
    ref: (el: HTMLElement | null) => { if (el) startObserve(el); else state.io?.disconnect() },
    observe: (el: HTMLElement) => startObserve(el),
    disconnect: () => { state.io?.disconnect(); state.io = null },
  }
}
