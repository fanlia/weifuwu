/**
 * vdom2 mount — 纯引擎挂载核心（无 ctx 组装、无 hooks——那些在 ui-dom/context.ts 组装层）
 *
 * 分层（vdom2 方案）：
 * - vdom2/ = 纯渲染引擎（vnode/kind/render/patch/build/mount 核心——改 vdom 不影响其他）
 * - ui-dom/context.ts = 组装层（createVdomContext：ctx.ui 完整能力 + hooks 转发 + popup tracker）
 * - ui-dom/middleware/ = 中间件（uiServe 等——后续迁移）
 *
 * 渲染管线：buildVNode（async 预构建——await 全部工厂）→ renderValue（同步落地）
 * ctx.ui.render：render-only（design 归档）——唯一渲染触发。
 */

import type { VNode, VNodeChild, CompVNode } from '../vnode.ts'
import { isComp } from '../vnode.ts'
import { createRegistry, type Registry } from './registry.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue, type PatchCtx } from './patch.ts'
import { auditEnabled, auditTree } from './audit.ts'
import { createClientBrowser } from '../browser.ts'
import { ctxVersion as getCtxVersion, type VdomCtx } from './ctx.ts'
import { emit, beginSession, endSession } from './events.ts'
import type { BrowserEnv } from '../types.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  /** 完整 ctx（ui-dom/context.ts createVdomContext 组装——ui 必填） */
  ctx: VdomCtx
  registry?: Registry
  renderer?: Renderer
  onError?: (e: unknown) => void
}

export interface MountHandle {
  ctx: any
  registry: Registry
  renderer: Renderer
  mount(comp: VNodeChild): Promise<void>
  rerender(): Promise<void>
  unmount(): void
  close?(): void
}

export interface Renderer {
  render(ids?: string[], req?: RenderRequestInfo): Promise<void>
  /** 补跑构建期被跳过的渲染请求（renderPath/渲染链落地后调用——导航期间状态更新不丢失） */
  flushPending(): Promise<void>
}

export interface VdomContext {
  ctx: any
  registry: Registry
  renderer: Renderer
  rootUi: any
}

/** 渲染请求来源（render 调用追踪——页面存续期所有渲染入口统一可追溯） */
export interface RenderRequestInfo {
  /** 调用来源分类 */
  source: 'component' | 'uiServe' | 'external' | 'root'
  /** 调用者组件名（source=component 时） */
  component: string | null
  /** 调用者组件 id（childUi 绑定的 _id） */
  nodeId: string | null
  /** 附加信息（uiServe: initial/nav；external: popup-tracker/hook 名等） */
  detail?: string
}

/** 渲染请求事件（machine=render, event=RENDER_REQUEST——每次 render()/renderPath 发射） */
function emitRenderRequest(req: RenderRequestInfo, ids: string[] | null, to: string, session: string): void {
  emit({ session, machine: 'render', nodeId: req?.nodeId ?? null, component: req?.component ?? null, from: req?.source ?? 'external', event: 'RENDER_REQUEST', to, payload: () => ({ ids, source: req?.source ?? 'external', detail: req?.detail ?? null, ts: Date.now() }), level: 'info', ts: Date.now() })
}

/** 渲染执行器（render-only 唯一渲染入口——per-id 串行链：并发触发排队补跑，
 *  同一组件渲染中再次触发 → 排队等前一个完成后补跑最新状态（合并语义）） */
export function createRenderer(opts: {
  registry: Registry
  ctx: any
  rootEl?: HTMLElement | null
  onError?: (e: unknown) => void
}): Renderer {
  const { registry, ctx } = opts
  // render 调度状态机（per-id）：IDLE → RUNNING → 完成后 IDLE；RUNNING 中再次触发 →
  // 排队（prev.then）——不是丢弃（错过状态更新会丢渲染，并发合并是既有语义，测试锁定）
  const renderChains = new Map<string, Promise<void>>()

  /** 递归查找 vnode 是否在树中（_child 链 + 手写 vnode 的 props.children——覆盖组件/原生/数组） */
  function treeContainsVNode(node: unknown, target: unknown): boolean {
    if (node == null || typeof node !== 'object') return false
    if (node === target) return true
    if (Array.isArray(node)) {
      for (const c of node) if (treeContainsVNode(c, target)) return true
      return false
    }
    const v = node as VNode
    if (v._child != null && treeContainsVNode(v._child, target)) return true
    if (typeof v.type === 'string' && v.props?.children != null && treeContainsVNode(v.props.children, target)) return true
    return false
  }

  async function doRenderOne(id: string): Promise<void> {
    const vnode = registry.idRegistry.get(id)
    if (!vnode || !isComp(vnode) || typeof vnode._render !== 'function') return
    const comp = vnode as CompVNode
    const session = beginSession('render')
    try {
      // 构建中守卫（前置——必须在 renderFn 之前）：组件正在被构建（首帧/父树构建期
      // buildComponent 的 await 链中）时，事件驱动的 doRenderOne（WS 回包/fetch 完成/
      // store 通知等）会命中本组件（_render 已设）。若先执行 renderFn + buildVNode
      // 再检查：
      //   - renderFn 重跑（读最新状态）+ 输出再构建 → 子树组件再次 mount（新 id）→
      //     孤儿实例（真实事故：agent-platform 首帧 Chat 输出被重复构建 3 次）
      //   - 状态变更已写入闭包/let——跳过后由下次渲染呈现（语义与后置检查等价）
      //   **pending 记录**：构建期请求不丢弃——构建完成（渲染链落地/renderPath
      //   完成）后 flushPending 补跑（真实事故：back 导航时新 Chat 构建期 fetch 完成
      //   rerender 被丢弃 → 消息永不加载）
      if (comp._lifecycle === 'building') {
        pendingIds.add(id)
        emit({ session, machine: 'render', nodeId: comp._id ?? null, component: compName(comp), from: 'IDLE', event: 'PARENT', to: 'SKIP_BUILDING', payload: () => ({ lifecycle: comp._lifecycle }), level: 'debug', ts: Date.now() })
        return
      }
      // 实例活跃性校验（防脱节 patch——真实事故：agent-platform 文件列表双份）：
      // registry 里可能残留**孤儿实例**（页面构建期重复构建/未 dispose——多代实例
      // 共享同一 DOM 锚点，旧实例闭包回调（loadWsList rerender 绑旧 id）仍触发）。
      // 孤儿实例的 _child 与 DOM 已脱节——doRenderOne 基于脱节旧树 patch 共享 DOM
      // → keyed 重复插入。信号：从当前渲染树根（_rootVNodeId）DFS——comp 不在树中
      // = 孤儿 → 跳过渲染 + 清理注册（防反复触发）。正常实例（树中）零影响。
      // **building 已在上面拦截**——导航构建中的新实例不会被误判为孤儿（rootVNodeId
      // 未更新期间，新实例不在旧树中——误判会丢渲染请求）
      const rootId = (ctx.ui as any)?._rootVNodeId
      if (rootId) {
        const rootV = registry.idRegistry.get(rootId)
        if (rootV && !treeContainsVNode(rootV, comp)) {
          registry.idRegistry.delete(id)
          registry.idRegistry.delete(`custom:${id}`)
          emit({ session, machine: 'render', nodeId: id, component: compName(comp), from: 'IDLE', event: 'PARENT', to: 'SKIP_ORPHAN', payload: () => ({ reason: 'not in render tree (stale instance)' }), level: 'warn', ts: Date.now() })
          return
        }
      }
      // renderFn 强制异步：await 数据 → 输出 vnode 树
      const output = await comp._render!(comp.props)
      const newChild = (await buildVNode(output, ctx, comp._child, registry)) ?? null
      const oldChild = comp._child
      comp._child = newChild as VNode | VNode[] | null
      // 定位渲染容器（render 调度状态机——显式分派 + 事件）：
      //  _parentNode 优先（树内组件）；_refNode.parentNode fallback。
      //  **rootEl 只属于根组件**（_rootVNodeId 匹配）：非根组件无 _parentNode/_refNode =
      //  挂载信息断裂（重建后未渲染/构建中）——渲染会 append 到 #root 成 stray 兄弟
      //  （真实事故：DemoAnchor 页面加载期 dispose→rebuild 后 lc=built 但 _refNode=null，
      //  自渲染落入 rootEl → 锚点树 append 到 #root）。根组件（portal 输出的 Modal 壳 +
      //  关闭渲染移除远程容器）经此定位；App 经 _refNode.parentNode（= rootEl）。
      const isRoot = comp._id != null && comp._id === (ctx.ui as any)?._rootVNodeId
      let parent = comp._parentNode ?? comp._refNode?.parentNode ?? null
      if (parent == null && isRoot) parent = opts.rootEl ?? null
      const to = parent ? (isRoot && !comp._parentNode ? 'ROOT' : 'MOUNTED') : 'SKIP_DETACHED'
      emit({ session, machine: 'render', nodeId: comp._id ?? null, component: compName(comp), from: 'IDLE', event: 'PARENT', to, payload: () => ({ lifecycle: comp._lifecycle }), level: 'debug', ts: Date.now() })
      if (!parent) {
        // 挂载断裂/父树构建中——渲染请求不丢弃（pending——构建完成后补跑）
        pendingIds.add(id)
        return
      }
      if (parent) {
        const patchCtx: PatchCtx = {
          browser: ctx.browser ?? createClientBrowser(),
          registry,
          ctxVersion: getCtxVersion(ctx),
        }
        const node = patchValue(parent, comp._refNode ?? null, oldChild, newChild, patchCtx)
        comp._refNode = node
        // 阶段 C audit：__WF_VDOM_AUDIT 开启时 patch 后结构校验（错位即报错，不静默传播）
        if (auditEnabled()) {
          try {
            const msgs: string[] = []
            auditTree(parent, newChild, (msg) => msgs.push(msg))
            if (msgs.length) console.error('[vdom2/audit] ' + msgs.join(' | '))
          } catch (e) { console.error('[vdom2/audit] 校验异常:', e) }
        }
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[vdom2] render error:', (e as { stack?: string })?.stack ?? e)
    } finally {
      endSession()
    }
  }
  /** 构建期被跳过的渲染请求（SKIP_BUILDING/SKIP_DETACHED——组件/父树构建中无锚点）。
   *  构建完成（渲染链落地/renderPath 完成）后补跑——导航/构建期间的状态更新不丢失
   *  （真实事故：back 导航时新 Chat 构建期 fetch 完成 rerender 被孤儿校验丢弃 →
   *  消息永不加载——DOM 恒显「暂无消息」） */
  const pendingIds = new Set<string>()

  /** 补跑就绪的 pending（组件已 built 且非 building）——构建链收敛后调用 */
  function flushPending(): Promise<void> {
    if (pendingIds.size === 0) return Promise.resolve()
    const pend = [...pendingIds]
    pendingIds.clear()
    const ready = pend.filter((id) => {
      const v = registry.idRegistry.get(id)
      return v && isComp(v) && typeof v._render === 'function' && v._lifecycle !== 'building' && v._lifecycle !== 'disposed'
    })
    if (ready.length) {
      return render(ready, { source: 'external', component: null, nodeId: null, detail: 'pending-flush' })
    }
    for (const id of pend) pendingIds.add(id) // 未就绪保留（父树构建中）——下轮 flush 重试
    return Promise.resolve()
  }

  function render(ids?: string[], req?: RenderRequestInfo): Promise<void> {
    if (ids == null) return Promise.resolve()
    emitRenderRequest(req ?? { source: 'external', component: null, nodeId: null }, ids, 'dispatch', '')
    // per-id 串行链：并发触发排队（合并补跑最新状态）——prev.then 保证同 id 不并发覆盖
    return Promise.all(ids.map((id) => {
      const prev = renderChains.get(id) ?? Promise.resolve()
      const next = prev.then(() => doRenderOne(id))
      renderChains.set(id, next)
      return next.finally(() => { if (renderChains.get(id) === next) renderChains.delete(id) })
    })).then(() => flushPending()) // 渲染链落地 → 补跑构建期被跳过的请求（收敛后 ready 空终止）
  }
  return { render, flushPending }
}

/** 组件名（render 调度 PARENT 事件用——尽力，type.name 缺失时回退） */
function compName(comp: CompVNode): string {
  return typeof comp.type === 'function' && comp.type.name ? comp.type.name : 'anonymous'
}

/** 纯引擎挂载（接受已组装 ctx——ui-dom/context.ts 提供便捷入口） */
export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, browser } = opts
  const registry = opts.registry ?? createRegistry()
  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root, onError: opts.onError })
  const rootUi = ctx.ui
  let mounted: VNodeChild | null = null
  let prevChild: VNodeChild | null = null

  const handle: MountHandle = {
    ctx,
    registry,
    renderer,
    async mount(input) {
      mounted = input
      const built = await buildVNode(input, ctx, null, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, browser)
      if (node != null) opts.root.appendChild(node)
      prevChild = (built as VNode)?._child ?? built
      if (rootUi) rootUi._rootVNodeId = (built as VNode)?._id ?? null
      if (auditEnabled()) {
        try {
          const msgs: string[] = []
          auditTree(opts.root, built, (msg) => msgs.push(msg))
          if (msgs.length) console.error('[vdom2/audit] ' + msgs.join(' | '))
        } catch (e) { console.error('[vdom2/audit] 校验异常:', e) }
      }
    },
    async rerender() {
      if (mounted == null) return
      // 全树强制重渲染：逐组件 renderOne（renderFn 重跑 + 组件级 patch 自身输出）。
      // 不用「force buildVNode + 根级 patchValue」——force 原地 mutate mounted → 旧/new
      // 引用相同（prevChild === rootV._child）→ 引用短路（arrToArr/V3-3a/textToText）
      // 全部失效 → 组件输出不更新（真实 bug：renderFn 重跑但 DOM 停留旧值）。
      // renderOne 的 old/new = 旧 _child vs 新输出——引用不同——patch 正常 diff。
      const ids: string[] = []
      for (const [, v] of registry.idRegistry) {
        if (isComp(v) && typeof v._render === 'function' && v._id) ids.push(v._id)
      }
      await renderer.render(ids)
    },
    unmount() {
      for (const [, vnode] of registry.idRegistry) {
        try {
          callRefCleanupFor(vnode, registry)
        } catch { /* noop */ }
      }
      opts.root.innerHTML = ''
    },
    // close 由上层按需提供（MountHandle.close? 可选）
  }
  handle.close = () => handle.unmount()
  return handle
}

// re-export（组装层/消费方需要）
import { callRefCleanupFor } from './registry.ts'
export { createRegistry }
export type { Registry }

/** vdom2 命令式挂载（toast/notification 等——buildVNode await 工厂 → renderValue → append） */
export function mountCommand(
  container: HTMLElement,
  vnode: VNode,
  ctx: VdomCtx | import('../types.ts').WfuiContext,
  opts?: { onMounted?: () => void },
): { id: string } {
  const vctx = ctx as VdomCtx
  const reg = vctx.__registry ?? createRegistry()
  const browser = vctx.browser ?? createClientBrowser()
  void Promise.resolve(buildVNode(vnode, vctx as VdomCtx, null, reg))
    .then(() => {
      const node = renderValue(vnode, vctx as VdomCtx, browser)
      if (node != null) container.appendChild(node)
      if (vnode._id && reg) {
        const v = reg.idRegistry.get(vnode._id)
        if (v) v._parentNode = container
      }
      opts?.onMounted?.()
    })
    .catch((e) => console.error('[vdom2] command mount error', e))
  return { id: vnode._id ?? '' }
}

/** vdom2 命令式卸载：ref 清理 + 卸载钩子 + 容器移除 */
export function unmountCommand(container: HTMLElement, vnode: VNode | null, ctx: VdomCtx | import('../types.ts').WfuiContext): void {
  const reg = (ctx as VdomCtx).__registry as Registry | undefined
  if (reg) {
    for (const [, v] of reg.idRegistry) {
      try { callRefCleanupFor(v, reg) } catch { /* noop */ }
    }
  }
  container.remove()
}

/** 命令式挂载容器（toast 等——body 下） */
export function createCommandContainer(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  const d = document.createElement('div')
  document.body.appendChild(d)
  return d
}
