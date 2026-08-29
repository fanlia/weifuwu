/**
 * vdom hooks — env（hooks 环境——per 组件实例）
 *
 * 设计（2026-12）：hooks 经 **ctx.ui 面**调用（`ctx.ui.useXXX`）——
 * instCtx.ui = createUi(env)——env 闭包绑定**当前组件实例**（compId 渲染
 * 触发/卸载注册）——无全局状态（零全局依赖——测试隔离天然）。
 *
 * requestRender = 组件级重渲染触发（当前实现：页面级 render——组件复用
 * 保持状态——组件级精准渲染为后续优化）。
 */

import type { ExternalStore } from '../store.ts'
import { createSignal } from '../store.ts'
import { BehaviorSubject, Subject, fromPromise, shareReplay, switchMap } from '../observable/index.ts'
import type { Observable } from '../observable/index.ts'
import { useObservable as useObservableEnv } from './use-observable.ts'
import { useStableRef, useOpen, useGlobalKey } from './basic.ts'
import { usePopupPosition } from './popup.ts'
import { openPopup, type PopupHandle, type PopupOpenOptions } from './popup-manager.ts'
import { useControlled } from './controlled.ts'
import { useScrollPosition, useInView } from './observe.ts'
import { useControlledInput } from './input.ts'
import { useDragDrop, useMedia, useBreakpoint } from './drag-media.ts'
import { useChat } from './chat.ts'
import { useTween, useDrag, useVisualViewport, useReducedMotion, type TweenOptions } from './stable.ts'

/** hooks 环境（per 组件实例——renderComponent 注入） */
export interface HookEnv {
  /** 组件级渲染触发（store 变化/事件驱动 hooks → 重渲染） */
  requestRender(): void
  /** 卸载注册（useExternal 退订等清理） */
  onUnmount(fn: () => void): void
  /** 浏览器环境（全局监听等——零全局直接访问） */
  getBrowser(): import('../browser/Browser.ts').Browser | null
  /** hook 状态缓存（渲染期调用——按调用顺序 index——per-instance） */
  nextHookIndex(): number
  getHookState<T>(idx: number): T | undefined
  setHookState<T>(idx: number, v: T): void
  /** **实例级 keyed 登记（2026-08——getter 化 hooks）**：按业务 key 幂等——
   *  不依赖调用顺序（useMedia/useExternal 可在任意位置任意次数调用——
   *  订阅注册幂等按 key——「调用位置规则」在 API 形状上不存在） */
  getInstanceData(): Map<unknown, unknown>
  /** 渲染完成后回调（挂载后动作——目标元素已就绪） */
  scheduleAfterRender(fn: () => void): void
  /** 共享 ctx（portal 独立通道——浮层内容组件继承 sharedCtx 独立实例） */
  getSharedContext(): import('../context/UIContext.ts').UIContext | null
}

/** hooks 注入面（ctx.ui）
 *
 * **getter 化纪律（2026-08——返回值形态 = 语义的载体）**：
 * - `() => T`（getter）：会随时间变化——**任何位置调用返回最新值**——
 *   mount 闭包持有永远最新——不存在「调用位置规则」（useExternal/
 *   useMedia/useBreakpoint——旧快照形态的静默失效类）
 * - `{...}`（handle）：一次性创建的资源/服务——mount 期获取长期持有
 * - 直接值：纯计算/常量
 * - **登记幂等**：getter 类 hook 按业务 key 登记（不依赖调用顺序）——
 *   任意位置任意次数调用不重复订阅/监听 */
export interface Ui {
  /** **Observable 订阅（2027-08——值源 hooks 的统一内层）**：
   *  getter 形态——`get()` 永远最新——订阅变化 → 自动重渲染——
   *  卸载自动退订——**幂等（同 source 引用不重复订阅）**——
   *  任何 Observable 都可消费（自研内核——波次 1） */
  useObservable<T>(source: import('../observable/index.ts').Observable<T>, init: T): () => T
  /** **异步取数（2027-08——Promise 心智——内部流管道）**：
   *  同 key 并发合并（fetch 1 次——8 次请求根治）· reload 作废旧请求
   *  （switchMap——竞态消灭）· 卸载自动退订 · 重挂载重新取（新鲜）——
   *  get() 返回 null = loading/error 无值 */
  useAsyncData<T>(fetcher: () => Promise<T>, key: string): [() => T | null, () => void]
  /** 共享状态订阅（**getter 形态**——`get()` 永远最新——store 变化 →
   *  组件重渲染——unmount 自动退订——订阅幂等（重复调用不重复订阅）） */
  useExternal<T>(store: ExternalStore<T>): () => T
  /** 响应式信号（顶层 createSignal——getter 读 + set/update 写 + 订阅——
   *  useExternal 同源消费（Signal 兼容 ExternalStore）） */
  signal<T>(initial: T): import('../store.ts').Signal<T>
  /** 资源注册（**hold 语义**：声明的资源在组件卸载时自动释放——等价
   *  onUnmount——推荐名——「我持有的东西，卸载时释放」） */
  hold(fn: () => void): void
  /** 稳定引用（双形状：容器 { current } / ref 回调 (el) => void——ui-dom 兼容） */
  useStableRef<T>(initial: T | ((el: T | null) => void), cleanup?: () => void): import('./basic.ts').StableRef<T> | ((el: T | null) => void)
  /** 受控/非受控开关（受控缺回调 warn——静默不可用防护——
   *  双形状：useOpen(init, controlled?) / useOpen({ open, onOpenChange, name })） */
  useOpen(initOrOpts: boolean | import('./basic.ts').UseOpenOptions, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }): import('./basic.ts').OpenState
  /** 卸载注册（ui-dom 兼容——ctx.ui.onUnmount） */
  onUnmount(fn: () => void): void
  /** 全局键盘监听（Escape 关闭等——unmount 自动清理——
   *  ui-dom 兼容单参：useGlobalKey((e) => ...) 无条件监听） */
  useGlobalKey(matchOrHandler: string | ((e: KeyboardEvent) => boolean) | ((e: KeyboardEvent) => void), handler?: (e: KeyboardEvent) => void): () => void
  /** 命令式弹窗（唯一形态——2027-03：ctx.popup.open——toast 心智——
   *  调用点构建内容——内核自管理挂载/更新/卸载——组件内部句柄同步样板） */
  openPopup(opts: PopupOpenOptions): PopupHandle
  /** 弹层位置跟踪（scroll/resize 重算——Affix 阈值/宽度——0-rect 防护） */
  usePopupPosition(options: import('./popup.ts').PopupPositionOptions): { top: number; left: number; refresh: () => void }
  /** 受控值（受控 props 语义——onChange 唯一出口——受控缺回调 warn） */
  useControlled<T>(controlled: import('./controlled.ts').ControlledOptions<T>, defaultValue?: T): import('./controlled.ts').ControlledValue<T>
  /** 滚动位置跟踪（rAF 节流——事件驱动重渲染——视口/内部容器通用——
   *  ui-dom 兼容：{ getScroller } 对象 / 字符串 / 元素 / 函数） */
  useScrollPosition(target?: import('./observe.ts').ScrollTarget): import('./observe.ts').ScrollPosition
  /** 可见性观察（IntersectionObserver——isIn 响应式——环境无 IO → 恒 false——
   *  ui-dom 兼容：{ root, threshold, target } 对象 / 元素 / 函数——
   *  返回 observe/disconnect/ready——组件自管模式） */
  useInView(options?: import('./observe.ts').UseInViewOptions | HTMLElement | (() => HTMLElement | null)): import('./observe.ts').InView
  /** 受控输入（内部输入态——焦点保持——IME 门控——选中回填） */
  useControlledInput(controlled: { value?: string; onChange?: (v: string) => void; name?: string }, opts?: { name?: string }): import('./input.ts').ControlledInput
  /** 拖拽（draggable enumerated + drag 事件——dataTransfer 数据） */
  useDragDrop(opts: import('./drag-media.ts').DragDropOptions): import('./drag-media.ts').DragDrop
  /** 媒体查询匹配（**getter 形态**——`match()` 任何时刻最新——变更→
   *  自动重渲染——注册幂等按 query——任意位置调用） */
  useMedia(query: string): () => boolean
  /** 命名断点（min-width 语义——**getter 形态**——`bp()` 当前最大断点） */
  useBreakpoint(breakpoints: Record<string, number>): () => string
  /** AI 对话会话（流式消息累积——handle 兼容 useExternal 订阅） */
  useChat(opts: import('./chat.ts').ChatOptions): import('./chat.ts').ChatHandle
  /** 数值补间（rAF + ease + reduced-motion 直落——目标变化自动补间——
   *  **对象 getter**：`tween.value` 永远最新——mount 闭包持有安全） */
  useTween(target: number, opts?: TweenOptions): { readonly value: number; reset: (to: number) => void }
  /** 指针拖拽（pointerdown 捕获 → window move/up 活动期监听——卸载释放） */
  useDrag(options: import('./stable.ts').DragOptions): { onPointerDown: (e: PointerEvent) => void }
  /** 可视视口跟踪（键盘弹起/缩放——vv 不可用 → window resize fallback） */
  useVisualViewport(): import('./stable.ts').VisualViewportHandle
  /** 响应式系统偏好（prefers-reduced-motion——mount 期一次判定） */
  useReducedMotion(): boolean
}

/** useAsyncData 模块级注册表（2027-08——跨组件共享同 key——并发合并）
 *
 * **v2 设计（波次 4——SSR 预取支持）**：
 * - state$（BehaviorSubject——**唯一真相源**——组件订阅它——getter 同步读）
 * - data$（trigger → switchMap(fetch) → state$.next——fetch 流——竞态取消）
 * - started：data$ 已接（首个组件订阅时）——**种子命中 = started 完成**（零 fetch）
 * - inflight：SSR 预取等待集合（并行预取完结）
 * - seed()/preload()：SSR→客户端种子通道（__DATA__——首帧零二次请求）
 * - **缓存保留语义**（重挂载零请求——导航返回瞬时）——reload 显式刷新 */
interface AsyncEntry {
  trigger: BehaviorSubject<void>
  state$: BehaviorSubject<unknown>
  fetcher: (() => Promise<unknown>) | null
  started: boolean
  seedHit: boolean
  sub: { unsubscribe(): void } | null
}
const asyncRegistry = new Map<string, AsyncEntry>()
/** SSR 预取等待集合（并行 fetch 的 in-flight promise——uiSsr 等待会合） */
export const asyncInflight = new Set<Promise<unknown>>()
/** **useAsyncData 错误事件流（OBSERVABLE-OPTIMIZE 波次 2——失败可观测）**
 *  ——模块级观测面——订阅者收 { key, error }——console.error 保持（dev
 *  日志）+ 流可观测（诊断器/作者订阅——错误不再只进控制台）——
 *  get() 仍 null（区块降级兼容——语义不变） */
export const asyncErrors$ = new Subject<{ key: string; error: unknown }>()

/** **SSR 种子收集**（服务端——渲染后取出——序列化进 __DATA__） */
export function asyncDataSeed(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, e] of asyncRegistry) {
    if (e.started && e.state$.get() !== null) out[key] = e.state$.get()
  }
  return out
}

/** **客户端种子预填**（hydrate——window.__DATA__ → 状态预热——零二次请求）：
 *  未创建的 entry 记 pendingSeeds（useAsyncData 创建时命中——状态初值 + skip fetch）；
 *  已创建的 entry 直接 next（状态更新） */
export function asyncDataPreload(seed: Record<string, unknown> | undefined): void {
  if (!seed) return
  for (const [key, value] of Object.entries(seed)) {
    const e = asyncRegistry.get(key)
    if (e) {
      e.state$.next(value)
      e.seedHit = true
    } else {
      pendingSeeds.set(key, value)
    }
  }
}
const pendingSeeds = new Map<string, unknown>()

/** 创建 ctx.ui 面（env 绑定当前组件实例） */
export function createUi(env: HookEnv): Ui {
  return {
    useObservable<T>(source: Observable<T>, init: T): () => T {
      return useObservableEnv(env, source, init)
    },
    useAsyncData<T>(fetcher: () => Promise<T>, key: string): [() => T | null, () => void] {
      // **模块级注册表（跨组件共享——同 key 并发合并——8 次请求根治）**：
      // - state$（唯一真相源——组件订阅——Behavior 同步初值 + 更新重渲染）
      // - data$ = trigger → switchMap(fetch) → state$.next（reload 竞态取消）
      let entry = asyncRegistry.get(key)
      if (!entry) {
        entry = {
          trigger: new BehaviorSubject<void>(undefined),
          state$: new BehaviorSubject<unknown>(pendingSeeds.get(key) ?? null),
          fetcher: null,
          started: pendingSeeds.has(key), // 种子命中 = 已就绪（零 fetch）
          seedHit: pendingSeeds.has(key),
          sub: null,
        }
        pendingSeeds.delete(key)
        asyncRegistry.set(key, entry)
      }
      entry.fetcher = fetcher as () => Promise<unknown>
      // **data$ 首接（模块级一次——并发合并）/种子命中跳过**（零重复 fetch）
      const ensureStarted = (): void => {
        if (entry!.sub) return // data$ 已接
        if (entry!.seedHit) return // **种子命中——零 fetch**（reload 时先置
        // seedHit=false 再调——之后正常接）
        entry!.started = true
        const data$ = entry!.trigger.asObservable().pipe(
          switchMap(() => {
            const f = entry!.fetcher as (() => Promise<unknown>) | null
            if (!f) return fromPromise(Promise.resolve(null))
            const p = f()
            // **in-flight 登记**（SSR 预取等待会合：预取遍结束后并行 fetch 完成）
            asyncInflight.add(p as Promise<unknown>)
            void (p as Promise<unknown>).finally(() => asyncInflight.delete(p as Promise<unknown>)).catch(() => {}) // 拒绝已由 fromPromise error 通道处理——finally 链不饿死
            return fromPromise(p)
          }),
        )
        entry!.sub = data$.subscribe({
          next: (v) => { entry!.state$.next(v) },
          error: (e) => {
            console.error('[vdom] useAsyncData:', e)
            asyncErrors$.next({ key, error: e }) // 失败可观测（诊断器/作者订阅）
            entry!.state$.next(null) // 失败 → 区块降级（get null——页面其余照常）
          },
        })
        // **初始加载 = BehaviorSubject 订阅即发**（唯一触发——无显式 next）
        // ——显式 next() 会双重触发（订阅即发 + next = 2× fetch 实证）
      }
      ensureStarted()
      const get = useObservableEnv<T | null>(env, entry.state$.asObservable(), null)
      const reload = (): void => {
        if (entry!.seedHit) { entry!.seedHit = false } // 种子失效——重新 fetch 路径
        entry!.state$.next(null)
        if (!entry!.sub) {
          ensureStarted() // 种子命中后首 reload——订阅即发（唯一触发——1 次 fetch）
        } else {
          entry!.trigger.next() // 已接——reload 触发（switchMap 竞态取消）
        }
      }
      return [get, reload]
    },
    useExternal<T>(store: ExternalStore<T>): () => T {
      // **getter 形态（2026-08）**：订阅登记幂等（按 store 引用——实例级
      // keyed——任意位置任意次数调用不重复订阅——mount 闭包持有 getter
      // 永远最新——旧快照返回的 mount 闭包失效类从 API 形状消灭）
      const data = env.getInstanceData()
      let entry = data.get(store) as { unsub?: () => void } | undefined
      if (!entry) {
        const unsub = store.subscribe(() => env.requestRender())
        env.onUnmount(unsub)
        entry = { unsub }
        data.set(store, entry)
      }
      return () => store.state
    },
    signal: <T>(initial: T) => createSignal(initial),
    hold: (fn: () => void) => env.onUnmount(fn),
    useStableRef: <T>(initial: T | ((el: T | null) => void), cleanup?: () => void) =>
      useStableRef(env, initial, cleanup),
    useOpen: (init: boolean, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }) =>
      useOpen(env, init, controlled),
    onUnmount: (fn: () => void) => env.onUnmount(fn),
    useGlobalKey: (matchOrHandler: string | ((e: KeyboardEvent) => boolean) | ((e: KeyboardEvent) => void), handler?: (e: KeyboardEvent) => void) =>
      useGlobalKey(env, matchOrHandler, handler),
    openPopup: (opts) => openPopup(env, opts),
    usePopupPosition: (options) => usePopupPosition(env, options),
    useControlled: <T>(controlled: import('./controlled.ts').ControlledOptions<T>, defaultValue?: T) =>
      useControlled(env, controlled, defaultValue),
    useScrollPosition: (target?: HTMLElement | (() => HTMLElement | null)) => useScrollPosition(env, target),
    useInView: (target: HTMLElement | (() => HTMLElement | null)) => useInView(env, target),
    useControlledInput: (controlled: { value?: string; onChange?: (v: string) => void }, opts?: { name?: string }) =>
      useControlledInput(env, controlled, opts),
    useDragDrop: (opts) => useDragDrop(env, opts),
    useMedia: (query: string) => useMedia(env, query),
    useBreakpoint: (breakpoints: Record<string, number>) => useBreakpoint(env, breakpoints),
    useChat: (opts) => useChat(env, opts),
    useTween: (target: number, opts?: TweenOptions) => useTween(env, target, opts),
    useDrag: (options) => useDrag(env, options),
    useVisualViewport: () => useVisualViewport(env),
    useReducedMotion: () => useReducedMotion(env),
  }
}
