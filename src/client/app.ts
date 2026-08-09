/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()        同步刷新当前组件
 *   ctx.ui.render(['#id']) 同步刷新指定组件
 *   ctx.ui.dirty()         异步刷新当前组件（微任务批处理）
 *   ctx.ui.$()             响应式状态容器（$.x = val 自动 dirty）
 *
 * render / dirty / $ 通过 prototype chain 实现组件级 scope：
 *   每个组件 mount 时创建 childCtx.ui = Object.create(ctx.ui)
 *   并设置 childCtx.ui._selfId = 组件 ID
 *   render() 无参时从 this._selfId 取当前组件 ID
 */

import type { WfuiContext, AppMiddleware, PopupPositionOptions, PopupPosition } from './types.ts'
import { render, patchPortal, renderPortal } from './render.ts'
import { hydrateVNode } from './hydration.ts'
import { createUi } from './ui.ts'
import { createClientBrowser } from './browser.ts'
import { patchValue } from './diff.ts'
import { callRefCleanup, idRegistry, onComponentUnmount } from './registry.ts'
import type { VNode, Component } from './vnode.ts'
import { createReactiveState } from './reactive.ts'
import { clampToViewport } from './popup.ts'
import { aiStream } from './ai.ts'
import { createChatSession, type UseChatHandle, type UseChatOptions, type UseChatState } from './use-chat.ts'

// ── createApp ──────────────────────────────────────────

/** 应用句柄：use() 链式累积中间件注入的 ctx 类型，mount() 时组件拿到完整注入 */
export interface App<C extends object = {}> {
  use<I extends object, O extends object>(mw: AppMiddleware<I, O>): App<C & O>
  mount(rootSelector: string, root: Component<any, C>, options?: { hydrate?: boolean }): Promise<void>
}

export function createApp<C extends object = {}>(): App<C> {
  const middlewares: AppMiddleware<any, any>[] = []
  let ctx: WfuiContext = {} as WfuiContext
  let container: Element | null = null
  let rootComponent: Component<any, any> | null = null
  let oldVNode: VNode | null = null
  let _rendering = false
  // mount 阶段标记：组件工厂（mountComponent 内 def 执行）期间置位——
  // 期间 $ 初始化赋值应丢弃（旧行为正确）；render 期 dirty 才推迟
  let _mounting = false
  let _mountingPrev: boolean[] = []
  function setMounting(v: boolean): void {
    _mountingPrev.push(_mounting)
    _mounting = v
  }
  function endMounting(): void {
    _mounting = _mountingPrev.pop() ?? false
  }

  // ── 异步渲染批处理 ──────────────────────────────────
  let _dirtyBatch = new Set<string>()
  let _dirtyScheduled = false

  // ── 响应式媒体查询注册表（组件级，避免重复注册 listener；卸载时逐个退订） ──
  const _mediaRegistry = new Map<string, {
    mql?: MediaQueryList
    handler?: (e: MediaQueryListEvent) => void
    /** breakpoint 多个断点各一个 mql+handler（useMedia 单个时为空） */
    mqls?: Array<{ mql: MediaQueryList; handler: () => void }>
  }>()

  /** 退订一个 media/bp 条目的全部 listener（卸载钩子与 destroy 共用） */
  function unsubscribeMediaEntry(key: string) {
    const entry = _mediaRegistry.get(key)
    if (!entry) return
    if (entry.mql && entry.handler) entry.mql.removeEventListener('change', entry.handler)
    entry.mqls?.forEach(({ mql, handler }) => mql.removeEventListener('change', handler))
    _mediaRegistry.delete(key)
  }

  // ── 弹层位置跟踪注册表（scroll/resize 时重算 fixed 坐标） ──
  const _popupTrackers = new Map<string, {
    pos: PopupPosition
    getEl: () => HTMLElement | null
    isOpen: () => boolean
    compute: (rect: DOMRect) => { top: number; left: number; width?: number }
    panel?: () => HTMLElement | null
    margin: number
  }>()
  let _popupListenersReady = false
  let _popupRaf = 0

  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  function ensurePopupListeners() {
    if (_popupListenersReady) return
    _popupListenersReady = true
    // capture 捕获所有嵌套容器的 scroll（scroll 不冒泡）
    window.addEventListener('scroll', schedulePopupRecompute, { capture: true, passive: true })
    window.addEventListener('resize', schedulePopupRecompute)
  }
  function destroyPopupListeners() {
    if (_popupListenersReady) {
      window.removeEventListener('scroll', schedulePopupRecompute, { capture: true } as any)
      window.removeEventListener('resize', schedulePopupRecompute)
      _popupListenersReady = false
    }
  }

  /** rAF 节流：滚动/resize 时重算所有开着的弹层坐标，然后精准刷新 */
  // ── 滚动位置跟踪注册表（全局 scroll 监听 + rAF 节流，仿弹层跟踪） ──
  const _scrollTrackers = new Map<string, {
    handle: { y: number }
    getScroller: () => HTMLElement | Window
  }>()

  function schedulePopupRecompute() {
    if (_popupRaf) return
    _popupRaf = requestAnimationFrame(() => {
      _popupRaf = 0
      const ids: string[] = []
      for (const [id, t] of _popupTrackers) {
        if (!t.isOpen()) continue
        const el = t.getEl()
        if (!el) continue
        const p = t.compute(el.getBoundingClientRect())
        // 视口夹紧（与 usePopupPosition.refresh 同规则）：滚动/resize 后也保证面板在视口内
        Object.assign(t.pos, clampToViewport(p, t.panel?.(), t.margin))
        ids.push(id)
      }
      // 滚动位置：更新所有注册组件（capture 监听覆盖 window + 子容器滚动）
      for (const [id, st] of _scrollTrackers) {
        const scroller = st.getScroller()
        const y = scroller instanceof Window
          ? (document.scrollingElement?.scrollTop ?? (scroller as Window).scrollY ?? 0)
          : (scroller as HTMLElement).scrollTop ?? 0
        if (y !== st.handle.y) {
          st.handle.y = y
          ids.push(id)
        }
      }
      if (ids.length > 0) (ctx as any).ui.render(ids)
    })
  }

  // ── 核心：按 ID 列表渲染组件 ───────────────────────
  function renderByIds(ids: string[]) {
    if (_rendering) return
    _rendering = true

    for (const id of ids) {
      const vnode = idRegistry.get(id)
      if (!vnode || !vnode._render) continue
      // 入口组件（dirty 源）先消费 dirty 标记，但自身仍要 render（它是变化源）
      ;(ctx as any).ui._dirtySet?.delete(id)
      const oldChild = vnode._child
      const newChild = vnode._render(vnode.props)
      vnode._child = newChild

      // 组件输出为 remote（Portal）：委托到 patchPortal，不操作父 DOM
      if ((oldChild && oldChild._placement === 'remote') || (newChild && newChild._placement === 'remote')) {
        if (oldChild && newChild) {
          patchPortal(oldChild, newChild, ctx)
        } else if (newChild) {
          renderPortal(newChild, ctx)
        } else if (oldChild) {
          callRefCleanup(oldChild)
        }
        continue
      }

      // local 组件：用 _parentNode / _refNode 找 DOM 容器
      if (!vnode._parentNode && vnode._refNode) {
        ;(vnode as any)._parentNode = vnode._refNode.parentNode
      }
      if (vnode._parentNode) {
        const newNode = patchValue(
          vnode._parentNode,
          vnode._refNode ?? null,
          oldChild, newChild, ctx,
        )
        if (newNode && newNode !== vnode._refNode) {
          vnode._refNode = newNode
        } else if (!newNode) {
          ;(vnode as any)._refNode = null
        }
      }
    }

    _rendering = false

    // 渲染过程中可能积累了 dirty 标记
    flushDirtyBatch()
  }

  function flushDirtyBatch() {
    const ui = ctx.ui as any
    if (_dirtyBatch.size > 0 && !ui._dirtyScheduled) {
      ui._dirtyScheduled = true
      queueMicrotask(() => {
        ui._dirtyScheduled = false
        const batch = [..._dirtyBatch]
        _dirtyBatch.clear()
        if (batch.length > 0) renderByIds(batch)
      })
    }
  }

    /** 获取调用者（组件）的 selfId — 优先从 this，其次从 app 层 ctx */
  function getSelfId(uiObj: any): string | undefined {
    return uiObj?._selfId ?? (ctx as any).ui?._selfId
  }

  const app = {
    get ctx() { return ctx },

    use<I extends object, O extends object>(mw: AppMiddleware<I, O>) {
      middlewares.push(mw as AppMiddleware<any, any>)
      return app as unknown as App<C & O>
    },

    async mount(rootSelector: string, RootComponent: Component<any, C>, options?: { hydrate?: boolean }) {
      rootComponent = RootComponent

      for (const mw of middlewares) {
        ctx = await mw(ctx)
      }

      const el = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector
      if (!el) throw new Error(`mount target not found: ${rootSelector}`)
      container = el as Element
      const hydrating = !!options?.hydrate
      if (!hydrating) container.innerHTML = ''

      // ── 注入 ctx.data（数据管道）────────────────────
      // 缓存 + in-flight 合并；hydration 场景从 window.__DATA__（SSR 序列化）预置种子
      const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
      const hydratedData = (globalThis as any).__DATA__
      if (hydratedData && typeof hydratedData === 'object') {
        for (const [k, v] of Object.entries(hydratedData)) {
          dataCache.set(k, { value: v })
        }
      }
      ;(ctx as any).data = {
        async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
          const entry = dataCache.get(key)
          // 缓存命中（含 __DATA__ 种子）——hydration 场景不重跑 fetcher
          if (entry && 'value' in entry) return entry.value as T
          // in-flight 合并：同 key 并发请求复用同一个 promise
          if (entry?.promise) return entry.promise as Promise<T>
          if (!fetcher) return undefined as T
          const promise = Promise.resolve()
            .then(() => fetcher())
            .then((val) => {
              dataCache.set(key, { value: val })
              return val
            })
          dataCache.set(key, { promise })
          return promise
        },
        set(key: string, value: unknown) {
          dataCache.set(key, { value })
        },
        has(key: string) {
          return dataCache.has(key)
        },
      }

      // ── 组件卸载清理（P3）：退订 media/breakpoint listener + popup tracker ──
      onComponentUnmount((id) => {
        for (const key of [..._mediaRegistry.keys()]) {
          if (key.startsWith(`media:${id}:`) || key === `bp:${id}`) unsubscribeMediaEntry(key)
        }
        _popupTrackers.delete(id)
        _scrollTrackers.delete(id)
      })

      // ── 注入 ctx.ui（工厂方法在 ui.ts，app 注入闭包依赖） ──
      ;(ctx as any).browser = createClientBrowser()
      ;(ctx as any).ui = createUi({
        ctx,
        renderByIds,
        getSelfId,
        dirtyBatch: _dirtyBatch,
        dirtySet: new Set<string>(),
        mediaRegistry: _mediaRegistry,
        popupTrackers: _popupTrackers,
        scrollTrackers: _scrollTrackers,
        schedulePopupRecompute,
        ensurePopupListeners,
        destroyPopupListeners,
        isRendering: () => _rendering,
        isMounting: () => _mounting,
        setMounting,
        endMounting,
      })

      // ── 首次渲染 ──────────────────────────────────────
      _rendering = true
      oldVNode = wrapComponent(RootComponent, ctx)
      oldVNode._id = '_wf_root'
      oldVNode._parentNode = container
      oldVNode._refNode = hydrating ? container.firstChild : null
      idRegistry.set('_wf_root', oldVNode)

      if (hydrating) {
        // Hydration：收养服务端 HTML（不重建 DOM，只接线事件/ref/$）
        await hydrateVNode(container, oldVNode, ctx)
      } else {
        const node = render(oldVNode, ctx)
        if (node instanceof Node) container.appendChild(node)
      }

      // 更新根节点 _refNode 为首个 DOM 节点
      oldVNode._refNode = container.firstChild

      _rendering = false

      // 消化 mount 过程中积累的 dirty 标记
      flushDirtyBatch()
    },

    destroy() {
      // 清理弹层位置跟踪的全局监听（scroll/resize）+ 注册表
      destroyPopupListeners()
      _popupTrackers.clear()
      _scrollTrackers.clear()
      for (const key of [..._mediaRegistry.keys()]) unsubscribeMediaEntry(key)
      // 全部组件失效：清 idRegistry，残留异步回调（Promise/WS/setTimeout）的 dirty 不再命中
      idRegistry.clear()
      if (container) container.innerHTML = ''
      container = null
      ctx = {} as WfuiContext
    },
  }

  return app
}

function wrapComponent(Comp: Component<any, any>, _ctx: WfuiContext): VNode {
  return { type: Comp, props: {}, key: undefined }
}
