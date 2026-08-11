/**
 * vdom/serve — 第 2 代 uiServe（UIRouter + vdom 引擎）
 *
 * 与第 1 代 serve.ts 的区别（AGENTS.md §4.0 无自动渲染原则）：
 * - 渲染管线：buildVNode（async 预构建 await 全部）→ renderValue/patchValue（同步落地）
 * - 调度：vdom scheduler（无 flush 批处理——$ 赋值直接 fire-and-forget 渲染）
 * - 动态挂载：buildVNode 阶段 await（无占位/注释/补全回调）
 *
 * 保留公开 API（uiServe/UIServeOptions/UIServeHandle）——迁移无缝。
 */

import { createClientBrowser } from '../browser.ts'
import { h } from '../vnode.ts'
import { uiLog } from '../debug.ts'
import type { UIRouter } from '../router.ts'
import type { VNode, WfuiContext, UIContext } from '../types.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue } from './diff.ts'
import { createVdomContext } from './mount.ts'
import type { VNodeChild } from '../vnode.ts'

/** uiServe 选项 */
export interface UIServeOptions {
  root: string | Element
  hydrate?: boolean
  /** loading 模式：不清空 root（信任调用方预置骨架屏 HTML）——首帧原子替换 */
  loading?: boolean
}

/** serve 句柄 */
export interface UIServeHandle<C extends object = {}> {
  /** 释放全部资源（监听/渲染状态/注册表） */
  close(): void
  /** 首帧完成 Promise：await 全部工厂 + DOM 落地后 resolve */
  ready: Promise<void>
  /** 当前 ctx（调试/测试用）——含 UIRouter ctx 注入的类型扩展 */
  ctx: WfuiContext & C
}

/** uiServe — 绑定唯一根节点 + URL 驱动渲染（vdom 引擎） */
export function uiServe<RC extends object = {}>(
  router: UIRouter<RC>,
  options: UIServeOptions,
): UIServeHandle<RC> {
  const browser = createClientBrowser()
  const el = typeof options.root === 'string'
    ? browser.query(options.root)
    : options.root
  if (!el) throw new Error(`uiServe: root not found: ${options.root}`)
  const root = el as HTMLElement
  const hydrating = !!options.hydrate
  if (!hydrating && !options.loading) root.innerHTML = ''

  // ── vdom 渲染上下文（ctx/registry/scheduler/rootUi——完整 hooks） ──
  const { ctx, registry, scheduler, rootUi, destroyPopupListeners } = createVdomContext({
    browser,
    root: root as HTMLElement,
  })

  // ── ctx.data（数据管道：缓存 + in-flight 合并 + __DATA__ 种子） ──
  const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
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
  // route 快照（router 中间件读写）
  ;(ctx as any).route = { params: {}, query: {}, path: '' }

  // ── 渲染（首帧 + 导航——统一 buildVNode → patch） ──
  let currentChild: VNodeChild = null
  let currentPath = ''
  let navToken = 0
  let readyResolve!: () => void
  const ready = new Promise<void>((r) => { readyResolve = r })
  let closing = false

  async function renderPath(path: string, initial: boolean): Promise<void> {
    const token = ++navToken
    const location = { pathname: path, search: '' } as any
    ;(ctx as any).route.path = path
    let output: VNodeChild
    try {
      output = await router.execute(location, ctx as UIContext, path)
    } catch (e: any) {
      // 错误兜底（不黑屏）：handler 抛错 → 错误页（对齐 v1 语义）
      output = h('div', { class: 'ui-dom-error' }, `页面渲染失败: ${e?.message ?? String(e)}`)
    }
    if (closing || token !== navToken) return // 过期导航丢弃（串行化——快速连续导航防竞态）
    // async 预构建：await 全部工厂（含动态挂载）——diff 只处理已构建树
    let built: VNodeChild
    try {
      built = await buildVNode(output as VNodeChild, ctx, currentChild, registry)
    } catch (e: any) {
      built = h('div', { class: 'ui-dom-error' }, `组件渲染失败: ${e?.message ?? String(e)}`)
    }
    if (closing || token !== navToken) return
    if (initial) {
      root.innerHTML = ''
      const node = renderValue(built, ctx, browser)
      if (node != null) root.appendChild(node)
    } else if (currentChild !== undefined) {
      const prev = currentChild
      currentChild = built
      const prevNode = (prev as VNode)?.el ?? (prev as VNode)?._refNode ?? null
      patchValue(root, prevNode, prev, built, { browser, registry, ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0 })
    }
    currentChild = built
    currentPath = path
    // root 组件 id（rootUi.render() 无参精准渲染——i18n 中间件等 root 层 render 调用）
    rootUi._rootVNodeId = (built as VNode)?._id
  }

  // ── 首帧 ──
  const initialPath = browser.pathname()
  void renderPath(initialPath, true).finally(() => { if (!closing) readyResolve() })

  // ── 导航（popstate——SPA 路由切换） ──
  const onPopState = () => {
    const path = browser.pathname()
    if (path !== currentPath) void renderPath(path, false)
  }
  browser.addEventListener('popstate', onPopState)

  return {
    close() {
      closing = true
      browser.removeEventListener('popstate', onPopState)
      destroyPopupListeners()
      registry.idRegistry.clear()
    },
    ready,
    ctx: ctx as WfuiContext & RC,
  }
}
