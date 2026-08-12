/**
 * vdom/mount — 挂载入口（首帧 + ctx/ui 组装）
 *
 * 渲染管线：buildVNode（async 预构建）→ renderValue（同步落地）。
 * ctx.ui：render/setMounting/endMounting——render-only（design/render-only-plan.md）。
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import type { BrowserEnv } from '../types.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue, type PatchCtx } from './diff.ts'
import { auditEnabled, auditTree } from './audit.ts'
import { createRegistry, type Registry, onComponentUnmountFor, cleanupComponent } from './registry.ts'
import type { HookEnv } from '../hooks/types.ts'
import { callRefCleanupFor } from './registry.ts'
import { createPopupTrackerSystem } from '../popup-tracker.ts'
import { createClientBrowser } from '../browser.ts'
import {
  useChat, useMedia, useBreakpoint, usePopupPosition, useHoverCapable,
  useStableRef, useVisualViewport, usePopup, useLongPress, useInView,
  useScrollPosition, useAsync, useControlled, useControlledInput, useOpen,
  usePresence,  useGlobalKey, useDrag, useDragDrop,
  useReducedMotion, useAnimationEnd, useTween, useExternal,
} from '../hooks/index.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  registry?: Registry
  renderer?: Renderer
  onError?: (e: unknown) => void
}

export interface MountHandle {
  ctx: WfuiContext
  registry: Registry
  renderer: Renderer
  /** 挂载根组件 */
  mount(comp: Component | VNodeChild): Promise<void>
  /** 整树强制重渲染（force——测试辅助/手动刷新：renderFn 重跑 + patch） */
  rerender(): Promise<void>
  /** 卸载（清理 DOM） */
  unmount(): void
}

export interface VdomContext {
  ctx: WfuiContext
  registry: Registry
  renderer: Renderer
  rootUi: any
  destroyPopupListeners: () => void
}

// ── 渲染执行器（render-only 唯一渲染入口——无调度队列） ──
// 语义：
// - render(ids) **直接执行**（无 enqueue/队列抽象）——await 它 = 数据（renderFn await）+
//   buildVNode + patchValue 全部完成，**DOM 已同步**
// - 同一组件进行中合并：渲染中再次 render → 等完成后补跑（最新状态落地，不丢变更）
// - 不同组件并行（Promise.all）——兄弟组件无竞态（各 patch 各子树）；父子同时渲染属
//   罕见场景（应用层单组件 render 为主），由同 id 合并兜底
// - renderFn 强制异步：renderOne 内 await（数据驱动组件的取数延迟被 await 吸收）
export interface Renderer {
  render(ids?: string[]): Promise<void>
}
export interface RendererOptions {
  registry: Registry
  ctx: WfuiContext
  rootEl?: HTMLElement
  onError?: (e: unknown) => void
}

export function createRenderer(opts: RendererOptions): Renderer {
  // 进行中渲染表（id → Promise）——同 id 合并（补跑）
  const inflight = new Map<string, Promise<void>>()

  async function renderOne(id: string): Promise<void> {
    // 同一组件渲染中：等完成后补跑（期间状态变化落地——不丢变更）
    const prev = inflight.get(id)
    if (prev) {
      await prev
      if (inflight.has(id)) return // 补跑已由其他调用启动
      return renderOne(id) // 无新渲染启动 → 自己补跑一次（最新状态）
    }
    const p = doRender(id)
    inflight.set(id, p)
    try { await p } finally { inflight.delete(id) }
  }

  async function doRender(id: string): Promise<void> {
    const vnode = opts.registry.idRegistry.get(id)
    if (!vnode || typeof vnode._render !== 'function') return
    // D-2 diff trace：`__WF_VDOM_DEBUG`（或 ?vdom_debug=1）开启——结构化日志，事故可回放
    const trace = !!((globalThis as any)?.__WF_VDOM_DEBUG)
    try {
      const patchCtx: PatchCtx = {
        browser: opts.ctx.browser,
        registry: opts.registry,
        // 当前 ctx 版本（rootUi._ctxVersion——bumpCtxVersion 递增；三态 skip 版本比较基准）
        ctxVersion: (opts.ctx as any)?.ui?._ctxVersion ?? 0,
      }
      if (trace) console.log(`[vdom/trace] render id=${id} comp=${(vnode.type as any)?.name || '?'}`)
      // renderFn 强制异步：await 数据 → 输出 vnode 树
      const output = await vnode._render!(vnode.props)
      const newChild = (await buildVNode(output, opts.ctx, vnode._child, opts.registry)) ?? null
      const oldChild = vnode._child as VNode | null
      vnode._child = newChild as VNode | VNode[] | null
      // 定位渲染容器：_parentNode 优先；_refNode.parentNode fallback（
      // _refNode 是组件输出的真实 DOM 锚点——挂载后未经历 diff 的组件 _parentNode 可能缺失，
      // 直接 fallback rootEl 会把整树当 diff 基准 → 整树被组件输出覆盖 → 重挂 → 动画重启 → 渲染风暴）
      const parent = (vnode as any)._parentNode ?? (vnode as any)._refNode?.parentNode ?? opts.rootEl ?? null
      if (parent) {
        const node = patchValue(parent, (vnode as any)._refNode ?? null, oldChild, newChild, patchCtx)
        if (node) (vnode as any)._refNode = node
        else (vnode as any)._refNode = null
        if (trace) console.log(`[vdom/trace]   patch parent=${parent.nodeName} ref=${(vnode as any)._refNode?.nodeName ?? 'null'}`)
        // 阶段 C audit：__WF_VDOM_AUDIT 开启时 patch 后结构校验（错位即报错，不静默传播）
        if (auditEnabled()) {
          try {
            const msgs: string[] = []
            auditTree(parent, newChild, (m) => msgs.push(m))
            if (msgs.length) console.error('[weifuwu/audit] ' + msgs.join(' | '))
            else if (trace) console.log('[vdom/trace]   audit ✓ 一致')
          } catch (e) {
            console.error('[weifuwu/audit] 校验异常:', e)
          }
        }
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[weifuwu] render error:', (e as any)?.stack ?? e)
    }
  }

  function render(ids?: string[]): Promise<void> {
    if (ids == null) {
      const selfId = (opts.ctx.ui as any)?._selfId
      if (!selfId) return Promise.resolve()
      return renderOne(selfId)
    }
    return Promise.all(ids.map((id) => renderOne(id))).then(() => undefined)
  }
  return { render }
}

/** 组装 vdom 渲染上下文（ctx/registry/renderer/rootUi——含完整 hooks 转发） */
export function createVdomContext(opts: MountOptions): VdomContext {
  const registry = opts.registry ?? createRegistry()
  const rootUi: any = {
    _selfId: '_wf_root',
    _mounting: false,
    _ctxVersion: 0,
    /** root 组件 vnode id（mount/serve 构建完成后设置——root 层 render 无参时精准渲染） */
    _rootVNodeId: undefined as string | undefined,
  }
  const ctx: WfuiContext = {
    browser: opts.browser,
    __registry: registry,
  } as any

  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root })

  // B-1：UIHandler 页面 render 无目标 warn 只发一次（防刷屏）
  let warnedNoTarget = false
  rootUi.render = function (this: any, ids?: string[]): Promise<void> {
    // this = 调用者的 childCtx.ui（组件 ctx.ui.render() → this._selfId = 组件 id）
    // root 层（this = rootUi，_selfId = '_wf_root' 虚拟 id）→ 渲染实际 root 组件（_rootVNodeId）
    if (ids == null) {
      const self = this._selfId !== '_wf_root' && this._selfId ? this._selfId : rootUi._rootVNodeId
      if (!self) {
        // B-1：UIHandler 页面（直接返回 vnode——页面根是 native vnode 无 _id/_render）
        // render 无参无目标 = 静默空操作 → warn 一次（对齐「不静默」纪律；
        // 正确用法：async 组件形态或 createStore + useExternal）
        if (!warnedNoTarget) {
          warnedNoTarget = true
          console.warn('[weifuwu] render() 无参但无渲染目标：页面根是 native vnode（UIHandler 直接返回 vnode 的页面形态），内部状态渲染无效。改用 async 组件形态（const Page: Component = async ... => (props) => ...）或 createStore + useExternal 共享状态。')
        }
        return Promise.resolve()
      }
      return renderer.render([self])
    }
    return renderer.render(ids)
  }
  // render-only（design/render-only-plan.md）：仅 render() 触发渲染——$ / dirty 已删除
  rootUi.setMounting = (v: boolean) => { rootUi._mounting = v }
  rootUi.endMounting = () => { rootUi._mounting = false }

;(ctx as any).ui = rootUi

  // ── 弹层/滚动跟踪系统（scroll/resize 重算 → 渲染） ──
  const tracker = createPopupTrackerSystem((ids: string[]) => { for (const id of ids) renderer.render([id]) })
  const { mediaRegistry, popupTrackers, scrollTrackers, ensurePopupListeners, destroyPopupListeners, cleanupTrackers } = tracker as any

  // ── 卸载钩子防御：hook 自身已注册清理（usePopupPosition/useScrollPosition/useMedia），
  // 此处兜底清理跟踪条目（防 hook 未接线场景——如旧代码路径） ──
  onComponentUnmountFor(registry, (id: string) => {
    cleanupTrackers(id)
    if (popupTrackers.has(id)) popupTrackers.delete(id)
  })

  // hooks 共享内部态（跨组件按 selfId）
  const warned = new Set<string>()
  const uncontrolledValues = new Map<string, any>()
  const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
  const openStates = new Map<string, boolean>()

  // ── HookEnv 组装（hooks 实现依赖——见 hooks/types.ts） ──
  const makeEnv = (self: any): HookEnv => ({
    selfId: () => {
      const id = self?._selfVNode?._id ?? self?._selfId
      return typeof id === 'string' ? id : undefined
    },
    render: (ids) => renderer.render(ids),
    browser: opts.browser,
    onUnmount: (fn) => onComponentUnmountFor(registry, fn),
    registry,
    mediaRegistry,
    popupTrackers,
    scrollTrackers,
    isMounting: () => rootUi._mounting === true,
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners,
  })

  // ── ctx.ui 完整能力（核心原语 + hooks 薄转发——实现已在 hooks/） ──
  rootUi.bumpCtxVersion = () => { rootUi._ctxVersion = (rootUi._ctxVersion ?? 0) + 1 }
  rootUi.selfId = function (this: any, name: string) {
    if (typeof name !== 'string' || !name) {
      throw new Error(`[weifuwu] selfId requires a non-empty string, got ${typeof name}`)
    }
    if (registry.idRegistry.has(name)) {
      throw new Error(`[weifuwu] Duplicate component ID: "${name}". Each component must have a unique custom ID.`)
    }
    const vnode = this._selfVNode
    if (!vnode) return
    vnode._customId = name
    registry.idRegistry.set(name, vnode)
  }
  rootUi.useChat = function (this: any, o: any) { return useChat(makeEnv(this), o) }
  rootUi.useMedia = function (this: any, q: string, cb: (m: boolean) => void) { return useMedia(makeEnv(this), q, cb) }
  rootUi.useBreakpoint = function (this: any, b1: any, cb?: any) { return useBreakpoint(makeEnv(this), b1, cb) }
  rootUi.usePopupPosition = function (this: any, o: any) { return usePopupPosition(makeEnv(this), o) }
  rootUi.useHoverCapable = function (this: any) { return useHoverCapable(makeEnv(this)) }
  rootUi.useStableRef = function (this: any, init: any, cleanup?: any) { return useStableRef(makeEnv(this), init, cleanup) }
  rootUi.useVisualViewport = function (this: any) { return useVisualViewport(makeEnv(this)) }
  rootUi.usePopup = function (this: any, o: any) { return usePopup(makeEnv(this), o) }
  rootUi.useLongPress = function (this: any, o: any) { return useLongPress(makeEnv(this), o) }
  rootUi.useInView = function (this: any, o: any) { return useInView(makeEnv(this), o) }
  rootUi.useScrollPosition = function (this: any, o: any) { return useScrollPosition(makeEnv(this), o) }
  rootUi.useAsync = function (this: any, f: () => Promise<any>) { return useAsync(makeEnv(this), f) }
  rootUi.useControlled = function (this: any, o: any) { return useControlled(makeEnv(this), o) }
  rootUi.useControlledInput = function (this: any, o: any) { return useControlledInput(makeEnv(this), o) }
  rootUi.useOpen = function (this: any, o: any) { return useOpen(makeEnv(this), o) }
  rootUi.usePresence = function (this: any, o?: any) { return usePresence(makeEnv(this), o) }
  rootUi.useGlobalKey = function (this: any, h: (e: KeyboardEvent) => void) { return useGlobalKey(makeEnv(this), h) }
  rootUi.useDrag = function (this: any, o: any) { return useDrag(makeEnv(this), o) }
  rootUi.useDragDrop = function (this: any, o: any) { return useDragDrop(makeEnv(this), o) }
  rootUi.useExternal = function (this: any, store: any) { return useExternal(makeEnv(this), store) }
  rootUi.useReducedMotion = function (this: any) { return useReducedMotion(makeEnv(this)) }
  rootUi.useAnimationEnd = function (this: any, cb: () => void, o?: { once?: boolean }) { return useAnimationEnd(makeEnv(this), cb, o) }
  rootUi.useTween = function (this: any, t: number, o?: any) { return useTween(makeEnv(this), t, o) }
  rootUi.destroyPopupListeners = destroyPopupListeners

  return { ctx, registry, renderer, rootUi, destroyPopupListeners }
}

export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, registry, renderer, rootUi, destroyPopupListeners } = createVdomContext(opts)
  let mounted: VNodeChild | null = null
  let prevChild: VNodeChild | null = null

  const handle: MountHandle = {
    ctx,
    registry,
    renderer,
    async mount(input) {
      // 首帧：buildVNode（await 全部工厂）→ renderValue（同步落地）
      mounted = input as VNodeChild
      const built = await buildVNode(input as VNodeChild, ctx, undefined, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, opts.browser)
      if (node != null) opts.root.appendChild(node)
      // 阶段 C audit：首帧后结构校验
      if (auditEnabled()) {
        try {
          const msgs: string[] = []
          auditTree(opts.root, built, (m) => msgs.push(m))
          if (msgs.length) console.error('[weifuwu/audit] ' + msgs.join(' | '))
        } catch (e) {
          console.error('[weifuwu/audit] 校验异常:', e)
        }
      }
      // prevChild 存「渲染内容」（组件 vnode 的 _child）——rerender 内容级 patch 对比用
      prevChild = (built as VNode)?._child ?? built
      // root 组件 id（rootUi.render() 无参精准渲染）——built 为组件 vnode 时才有 id
      rootUi._rootVNodeId = (built as VNode)?._id
    },
    async rerender() {
      if (mounted == null) return
      // force 整树重建：renderFn 重跑（读最新闭包/外部状态）→ 内容级 patch
      // （不 patch 组件 vnode 本身——组件三态 skip 会复用旧 _child 抵消 force）
      const built = await buildVNode(mounted, ctx, mounted as any, registry, { force: true })
      const rootV = mounted as VNode
      const oldChild = prevChild
      const newChild = rootV._child as VNodeChild
      const prevNode = opts.root.firstChild
      // force patch：跳过三态 skip（buildVNode force 重跑了 renderFn——diff 必须全量落地）
      patchValue(opts.root, prevNode, oldChild, newChild, {
        browser: opts.browser, registry,
        ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0,
        force: true,
      })
      prevChild = newChild
    },
    unmount() {
      // ref 清理递归（v1 语义：unmount 时 ref(null) 全部调用——不中断子树）
      for (const [, vnode] of registry.idRegistry) {
        try { callRefCleanupFor(vnode, registry as any) } catch (e) { console.error('[weifuwu] unmount ref error', e) }
      }
      opts.root.innerHTML = ''
      registry.idRegistry.clear()
      destroyPopupListeners()
    },
  }
  return handle
}

// ── 命令式挂载辅助（弹窗中间件用——components 各组件内部实现中间件，见 design/render-only-plan.md）──

/** 命令式挂载 registry：ctx.__registry 优先（真实引擎），mock ctx 惰性创建（组件测试兼容） */
function commandRegistry(ctx: WfuiContext): Registry {
  return ((ctx as any).__registry ?? ((ctx as any).__registry = createRegistry())) as Registry
}

/** vdom 命令式挂载：buildVNode（await 工厂）→ renderValue → append + _parentNode */
export function mountCommand(
  container: HTMLElement,
  vnode: VNode,
  ctx: WfuiContext,
  opts?: { onMounted?: () => void },
): { id: string } {
  const reg = commandRegistry(ctx)
  const browser = (ctx.browser ?? createClientBrowser()) as BrowserEnv
  void Promise.resolve(buildVNode(vnode, ctx, undefined, reg))
    .then(() => {
      const node = renderValue(vnode, ctx, browser)
      if (node != null) container.appendChild(node)
      // 关键：ctx.ui.render → renderByIds 定位容器（否则 vnode._parentNode 为 null——跳过）
      if (vnode._id && reg) {
        const v = reg.idRegistry.get(vnode._id)
        if (v) v._parentNode = container
      }
      opts?.onMounted?.()
    })
    .catch((e) => console.error('[weifuwu] command mount error', e))
  return { id: vnode._id ?? '' }
}

/** vdom 命令式卸载：ref 清理 + 卸载钩子 + 容器移除 */
export function unmountCommand(container: HTMLElement, vnode: VNode | null, ctx: WfuiContext): void {
  const reg = (ctx as any).__registry as Registry | undefined
  if (vnode && reg) {
    callRefCleanupFor(vnode, reg as any)
    if (vnode._id) cleanupComponent(reg, vnode._id)
  }
  container.remove()
}

/** 创建命令式挂载容器（body 下独立 div） */
export function createCommandContainer(): HTMLDivElement | null {
  const browser = createClientBrowser()
  const container = browser.createElement('div')
  if (!container) return null
  browser.bodyAppend(container)
  return container
}

