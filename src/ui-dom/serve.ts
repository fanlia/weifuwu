/**
 * weifuwu/ui-dom serve — 渲染运行时（VDOM 落地机制）
 *
 * 定稿架构：serveUI = VDOM（落地，对齐后端 serve(router) = HTTP 传输）。
 *
 * uiServe(router, { root }) 调用时路由已全部注册——serve 负责：
 *   1. 创建渲染运行时：局部 registry + createUi（19 原语）+ popup-tracker + ctx.data/browser
 *   2. 监听 popstate/hashchange → router.match（params 注入）→ 中间件链 → handler → vnode
 *   3. renderValue / patchValue diff/patch DOM；组件 $ dirty → renderByIds（局部 registry）
 *
 * 与 createApp 隔离：registry/popup-tracker/dirty 集合全部局部实例（client 零改动）。
 */

import { createRegistry, callRefCleanupFor, onComponentUnmountFor } from './registry.ts'
import type { Registry } from './registry.ts'
import { createPopupTrackerSystem } from './popup-tracker.ts'
import { createUi } from './ui.ts'
import type { UiInternal } from './ui.ts'
import { renderValue, renderPortal, patchPortal } from './render.ts'
import { createReactiveState } from './reactive.ts'
import { patchValue } from './diff.ts'
import { hydrateVNode } from './hydration.ts'
import { createClientBrowser } from './browser.ts'
import type { UIRouter } from './router.ts'
import type { VNode, WfuiContext, UIContext } from './types.ts'

/** uiServe 选项 */
export interface UIServeOptions {
  root: string | Element
  hydrate?: boolean
}

/** serve 句柄 */
export interface UIServeHandle<C extends object = {}> {
  /** 释放全部资源（监听/渲染状态/注册表） */
  close(): void
  /** 当前 ctx（调试/测试用）——含 UIRouter ctx 注入的类型扩展 */
  ctx: WfuiContext & C
}

/** uiServe — 绑定唯一根节点 + URL 驱动渲染（= VDOM 落地，对齐 serve(router)） */
export function uiServe<RC extends object = {}>(
  router: UIRouter<RC>,
  options: UIServeOptions,
): UIServeHandle<RC> {
  const browser = createClientBrowser()
  const el = typeof options.root === 'string'
    ? browser.query(options.root)
    : options.root
  if (!el) throw new Error(`uiServe: root not found: ${options.root}`)
  const root = el as Element
  const hydrating = !!options.hydrate
  if (!hydrating) root.innerHTML = ''

  // ── 渲染运行时（局部实例——与 createApp 隔离） ──
  const registry: Registry = createRegistry()
  const dirtyBatch = new Set<string>()
  const dirtySet = new Set<string>()
  const mediaRegistry = new Map()
  let _rendering = false
  let _mounting = false
  const _mountingPrev: boolean[] = []
  function setMounting(v: boolean): void {
    _mountingPrev.push(_mounting)
    _mounting = v
  }
  function endMounting(): void {
    _mounting = _mountingPrev.pop() ?? false
  }

  // ctx（WfuiContext——createUi 需要先有 ctx 引用）
  const ctx = { params: {}, query: {} } as unknown as UIContext

  // ── ctx.data（数据管道：缓存 + in-flight 合并 + __DATA__ 种子） ──
  const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
  // hydration 种子契约（ssr.ts 输出 window.__DATA__ 脚本——globalThis 与 window 双查兼容 jsdom/浏览器）
const hydratedData = (globalThis as any).__DATA__ ?? (window as any).__DATA__
  if (hydratedData && typeof hydratedData === 'object') {
    for (const [k, v] of Object.entries(hydratedData)) dataCache.set(k, { value: v })
  }
  ctx.data = {
    async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      const entry = dataCache.get(key)
      if (entry && 'value' in entry) return entry.value as T
      if (entry?.promise) return entry.promise as Promise<T>
      if (!fetcher) return undefined as T
      const promise = Promise.resolve()
        .then(() => fetcher())
        .then((val) => { dataCache.set(key, { value: val }); return val })
      dataCache.set(key, { promise })
      return promise
    },
    set(key: string, value: unknown) { dataCache.set(key, { value }) },
    has(key: string) { return dataCache.has(key) },
  }

  // ── 渲染调度（渲染期保护 + 微任务批量） ──
  let _dirtyScheduled = false

  function flushDirtyBatch() {
    if (dirtyBatch.size > 0 && !_dirtyScheduled) {
      _dirtyScheduled = true
      queueMicrotask(() => {
        _dirtyScheduled = false
        const batch = [...dirtyBatch]
        dirtyBatch.clear()
        if (batch.length > 0) renderByIds(batch)
      })
    }
  }

  /** 核心：按 ID 列表渲染组件（局部 registry——组件 $ dirty 精准刷新） */
  function renderByIds(ids: string[]) {
    if (_rendering) return
    _rendering = true

    for (const id of ids) {
      const vnode = registry.idRegistry.get(id)
      if (!vnode || !vnode._render) continue
      ;(ctx.ui as WfuiContext['ui'] & UiInternal)._dirtySet?.delete(id)
      const oldChild = vnode._child as VNode | null
      const newChild = vnode._render(vnode.props) as VNode | null
      vnode._child = newChild

      // 组件输出为 remote（Portal）：委托到 patchPortal，不操作父 DOM
      if ((oldChild && (oldChild as any)._placement === 'remote') || (newChild && (newChild as any)._placement === 'remote')) {
        if (oldChild && newChild) patchPortal(oldChild, newChild, ctx)
        else if (newChild) renderPortal(newChild, ctx)
        else if (oldChild) callRefCleanupFor(oldChild, registry)
        continue
      }

      // local 组件：用 _parentNode / _refNode 找 DOM 容器
      if (!vnode._parentNode && vnode._refNode) {
        const pn = vnode._refNode.parentNode
        if (pn) vnode._parentNode = pn
      }
      if (vnode._parentNode) {
        const newNode = patchValue(
          vnode._parentNode,
          vnode._refNode ?? null,
          oldChild, newChild, ctx,
        )
        if (newNode && newNode !== vnode._refNode) vnode._refNode = newNode
        else if (!newNode) vnode._refNode = null
      }
    }

    _rendering = false
    // 渲染过程中可能积累了 dirty 标记
    flushDirtyBatch()
  }

  // ── 弹层/滚动位置跟踪系统（renderByIds 引用——延迟绑定，函数提升后可用） ──
  let popupTracker: ReturnType<typeof createPopupTrackerSystem> | null = null
  function getPopupTracker() {
    if (!popupTracker) popupTracker = createPopupTrackerSystem((ids) => ctx.ui.render(ids))
    return popupTracker
  }

  // ── 注入 ctx.ui（createUi——19 原语，局部 registry/popup-tracker） ──
  ctx.browser = createClientBrowser()
  ctx.__registry = registry
  ctx.ui = createUi({
    ctx,
    renderByIds,
    getSelfId: (uiObj: any) => uiObj?._selfId ?? (ctx.ui as any)?._selfId,
    dirtyBatch,
    dirtySet,
    mediaRegistry,
    popupTrackers: getPopupTracker().popupTrackers,
    scrollTrackers: getPopupTracker().scrollTrackers,
    schedulePopupRecompute: getPopupTracker().schedulePopupRecompute,
    ensurePopupListeners: getPopupTracker().ensurePopupListeners,
    destroyPopupListeners: getPopupTracker().destroyPopupListeners,
    isRendering: () => _rendering,
    isMounting: () => _mounting,
    setMounting,
    endMounting,
    registry,
  })

  // 卸载钩子：组件卸载时清理 media/popup/scroll 跟踪
  onComponentUnmountFor(registry, (id) => {
    for (const key of [...mediaRegistry.keys()]) {
      if (key.startsWith(`media:${id}:`) || key === `bp:${id}`) {
        const entry = mediaRegistry.get(key)
        if (entry?.mql && entry.handler) entry.mql.removeEventListener('change', entry.handler)
        entry?.mqls?.forEach(({ mql, handler }: any) => mql.removeEventListener('change', handler))
        mediaRegistry.delete(key)
      }
    }
    getPopupTracker().cleanupTrackers(id)
  })

  // 整树刷新能力（注入中间件/A 组件用——root ctx.ui.render 不触发整树）
  ;(ctx as any).__rerender = () => scheduleRender()
  // ctx.app.navigate（对齐 client router() 注入——组件导航用）
  ;(ctx as any).app = {
    navigate: (path: string) => {
      if (router.mode === 'hash') browser.setHash('#' + path)
      else browser.navigate(path)
      scheduleRender()
    },
  }

  // ── 渲染主循环 ──
  let oldVNode: VNode | null = null
  let rendering = false
  let scheduled = false

  function scheduleRender() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      void doRender()
    })
  }

  async function doRender() {
    if (rendering) return
    rendering = true
    try {
      const path = router.getPath()
      // ctx.route 同步（对齐 client router 注入——组件读 ctx.route.params）
      ;(ctx as any).route = { path, params: ctx.params, query: ctx.query }
      // 路由级 $（handler 的 ctx.ui.$——首次创建，重渲染复用）
      if (!(ctx as any).__state) {
        const state = createReactiveState(() => {
          if (!rendering) scheduleRender()
        })
        ;(ctx as any).__state = state
        // 覆盖 root ui.$：handler（root，无 _selfVNode）→ 路由级 state；
        // 组件（childCtx.ui 有 _selfVNode）→ 保留 createUi 组件级逻辑（$ 独立 + dirty 精准）
        const originalDollar = (ctx.ui as any).$
        ;(ctx.ui as any).$ = function (this: any) {
          if (this && this._selfVNode) return originalDollar.call(this)
          return state
        }
      }
      // handler 执行（router.execute：匹配 + 中间件链 + handler → vnode）
      const vnode = await router.execute(window.location, ctx, path)

      // 落地：首次挂载 / 后续 diff（hydrate 收养）
      if (oldVNode == null) {
        if (vnode) {
          const node = hydrating && root.firstElementChild
            ? (hydrateVNode(root, vnode, ctx), root.firstChild)
            : renderValue(vnode, ctx)
          if (node && node.parentNode !== root) root.appendChild(node)
        }
      } else {
        patchValue(root, root.firstChild, oldVNode, vnode, ctx)
      }
      oldVNode = vnode
    } catch (err) {
      console.error('[ui-dom] render error:', err)
      if (oldVNode == null) {
        const errNode = browser.createElement('div') as HTMLDivElement
        errNode.className = 'ui-dom-error'
        errNode.textContent = `渲染错误: ${(err as Error)?.message ?? String(err)}`
        root.appendChild(errNode)
      }
    } finally {
      rendering = false
    }
  }

  // URL 变化监听
  const onPop = () => scheduleRender()
  browser.addEventListener('popstate', onPop)
  const onHash = () => scheduleRender()
  if (router.mode === 'hash') browser.addEventListener('hashchange', onHash)

  // 首次渲染
  scheduleRender()

  // ── handle ──
  return {
    get ctx() { return ctx as unknown as WfuiContext & RC },
    close() {
      browser.removeEventListener('popstate', onPop)
      if (router.mode === 'hash') browser.removeEventListener('hashchange', onHash)
      if (oldVNode) callRefCleanupFor(oldVNode, registry)
      getPopupTracker().destroy()
      registry.idRegistry.clear()
      root.innerHTML = ''
      oldVNode = null
    },
  }
}
