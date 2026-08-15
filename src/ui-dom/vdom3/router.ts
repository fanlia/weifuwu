/**
 * vdom3 router — 路由（location → ROUTE_CHANGE 事件 → 组件挂载 → DOM 全链路）
 *
 * 事件流覆盖：ROUTE_CHANGE(path, params) → COMP_MOUNT → NODE_CREATE/INSERT → ...
 * 页面切换 = 异类型 patch（旧页面 COMP_UNMOUNT + REMOVE；新页面 MOUNT + CREATE/INSERT）——
 * 全链路事件化（location→DOM 的完整因果链可回放）。
 */

import type { VNode, V3Ctx, PortalVNode } from './types.ts'
import { buildVNode } from './build.ts'
import { mount, patch, removeNodeWithLifecycle, removePortalContent, isPortalNode } from './render.ts'
import { stream, ev } from './events.ts'
import { findComponent } from './root.ts'
import { ensureDelegationRoot, addGlobalListener } from './delegate.ts'

/** 布局包裹（跨路由复用——layout 函数引用稳定 → patch 同位置同类型复用——
 *  工厂不重跑——内部状态（折叠/高亮）保持——vdom2 布局层语义） */
export type RouteLayout = (page: VNode) => VNode

export interface RouteDef {
  path: string
  /** 页面渲染（params 注入——:id 等） */
  render: (params: Record<string, string>) => VNode
  /** 布局包裹（可选——页面在布局插槽内） */
  layout?: RouteLayout
}

export interface RouterHandle {
  navigate(path: string): void
  /** 当前路径 */
  path(): string
  /** 立即处理当前 URL（测试/恢复） */
  refresh(): void
  close(): void
}

function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  const reStr = String(path)
    .replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)' })
    .replace(/\*/g, '.*')
  return { re: new RegExp(`^${reStr}$`), keys }
}

function match(routes: RouteDef[], path: string): { def: RouteDef; params: Record<string, string> } | null {
  for (const def of routes) {
    const { re, keys } = compilePath(def.path)
    const m = path.match(re)
    if (!m) continue
    const params: Record<string, string> = {}
    for (let i = 0; i < keys.length; i++) params[keys[i]] = decodeURIComponent(m[i + 1])
    return { def, params }
  }
  return null
}

/** 组件名（事件可观测） */
function compNameOf(v: VNode): string {
  return typeof v.type === 'function' ? ((v.type as { name?: string }).name || 'anonymous') : 'anonymous'
}

/** 创建路由应用（初始挂载 + popstate 导航；options.ctx 注入中间件面——页面组件消费） */
export function createRouter(routes: RouteDef[], root: HTMLElement, options?: { initialPath?: string; ctx?: Record<string, unknown> }): RouterHandle {
  let current: VNode | null = null
  let pageVnode: VNode | null = null // 当前页面组件 vnode（组件引用——重渲染定位）
  let busy = false
  type Op = { type: 'nav'; path: string } | { type: 'refresh' } | { type: 'comp'; id: string }
  // 组件级 dirty 多槽（滚动高频多弹层跟随——busy 时各自排队，互不挤占）
  const dirtyComps = new Set<string>()
  let queue: Op | null = null

  // 事件代理根（挂载点监听——每挂载点每事件一次——惰性注册）
  ensureDelegationRoot(root)

  // 页面组件 ctx：render = 重渲染当前页（组件工厂收到——交互驱动）+ 注入中间件面
  let pageCtx: V3Ctx = {} as V3Ctx
  const makePageCtx = (): V3Ctx =>
    Object.assign(Object.create(options?.ctx ?? {}), {
      render: () => { void updatePage() },
      // 组件级精准更新（build.ts compCtx 的 componentRender 读取——页面下组件
      // ctx.render/ui.render 只重跑该组件——不经过页面级 build（props 剪枝会吞
      // 组件内部状态变化——count 闭包更新后 props 未变 → 剪枝复用旧输出））
      _componentRender: (compId: string) => { void updateComponent(compId) },
    }) as V3Ctx

  /** 重渲染当前页面（页面组件 ctx.render——组件实例复用 + patch） */
  async function updatePage(): Promise<void> {
    if (busy) { queue = { type: 'refresh' }; return } // 与导航串行（渲染中触发 → 排队）
    if (!current || !pageVnode) { stream.emit(ev('internal', 'skip', 'page', { reason: !current ? 'no-current' : 'no-page-vnode' })); return }
    busy = true
    try {
      const v = pageVnode
      if (typeof v.type === 'function' && v._render) {
        // RENDER 事件（jsx 层——页面组件渲染可观测）
        stream.emit(ev('comp', 'render', v._id!, { name: compNameOf(v) }))
        const HANG_MS = 3000
        const output = await Promise.race([
          v._render(v.props),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`页面 renderFn 挂起超时（${HANG_MS}ms）`)), HANG_MS)),
        ])
        if (output == null) return
        const oldOut = v._child ?? null
        const built = await buildVNode(output, pageCtx, oldOut && typeof oldOut === 'object' ? (oldOut as VNode) : null)
        v._child = built
        patch(oldOut as VNode | null, built, root)
      }
    } catch (e) {
      // 页面刷新失败 → error:caught（事件流可观测——不中断路由）
      const err = e as Error
      stream.emit(ev('error', 'caught', pageVnode?._id ?? 'page', { phase: 'update', name: 'page', message: err?.message ?? String(e) }))
    } finally {
      busy = false
      if (queue != null) { const q = queue; queue = null; void runOp(q) }
    }
  }

  /** 组件级精准更新（页面内组件 ctx.render——与 createRoot 同语义：
   *  findComponent 定位 → 只重跑该组件 renderFn + patch 其输出——兄弟/父零执行） */
  const hangMs = (): number => ((globalThis as any).__v3HangMs ?? 3000)

  async function updateComponent(compId: string): Promise<void> {
    // 渲染中再触发 → dirty 排队组件级补跑（不得降级为页面级 refresh——页面级
    // build 的 props 剪枝会吞组件内部状态变化——滚动跟随丢失的根因；
    // 多槽 dirtyComps——多个弹层组件滚动跟随互不挤占）
    if (busy) {
      // 内部决策事件：渲染中排队（busy→dirty——多槽补跑不丢——状态可观测）
      stream.emit(ev('internal', 'queue', compId, { reason: 'busy' }))
      dirtyComps.add(compId)
      return
    }
    if (!current) { stream.emit(ev('internal', 'skip', compId, { reason: 'no-current' })); return }
    busy = true
    try {
      const comp = findComponent(current, compId)
      if (!comp || typeof comp.type !== 'function' || !comp._render) {
        stream.emit(ev('internal', 'notfound', compId, { reason: 'comp-missing-or-render-absent' }))
        return
      }
      stream.emit(ev('comp', 'render', comp._id!, { name: compNameOf(comp) }))

      // await 挂起检测（挂起 = 静默失败——错误事件流必须覆盖：
      // renderFn/buildVNode 永不 resolve → error:caught phase:'update'）
      const hm = hangMs()
      const output = await Promise.race([
        comp._render(comp.props),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`renderFn 挂起超时（${hm}ms）——组件 ${compId} 未 resolve`)), hm)),
      ])
      const oldOut = comp._child ?? null
      const built = output ? await Promise.race([
        buildVNode(output, pageCtx, oldOut ?? undefined),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`buildVNode 挂起超时（${hm}ms）——组件 ${compId} 输出构建未 resolve`)), hm)),
      ]) : null
      comp._child = built
      const parent = (comp.el?.parentNode ?? root) as HTMLElement
      if (oldOut && built) {
        patch(oldOut, built, parent)
      } else if (built) {
        mount(built, parent)
      } else if (oldOut || comp.el) {
        if (oldOut && isPortalNode(oldOut)) {
          removePortalContent(oldOut as PortalVNode)
        } else {
          const oldEl = (oldOut && oldOut.el) || comp.el
          if (oldEl && oldEl.parentNode === parent) {
            removeNodeWithLifecycle(oldEl, parent, oldOut as VNode | null)
          }
        }
      }
      comp.el = built?.el ?? null
    } catch (e) {
      // 组件级更新失败 → error:caught（事件流可观测——渲染管线不中断——错误定位到组件）
      const err = e as Error
      stream.emit(ev('error', 'caught', compId, { phase: 'update', name: compNameOf(findComponent(current, compId) ?? ({} as VNode)), message: err?.message ?? String(e) }))
    } finally {
      busy = false
      if (dirtyComps.size > 0) {
        // 补跑排队组件（多槽——逐个补——滚动收敛）
        const next = dirtyComps.values().next().value as string
        dirtyComps.delete(next)
        void updateComponent(next)
      } else if (queue != null) { const q = queue; queue = null; void runOp(q) }
    }
  }

  function runOp(op: Op): void {
    if (op.type === 'nav') void handleRoute(op.path)
    else if (op.type === 'comp') void updateComponent(op.id)
    else void updatePage()
  }

  async function handleRoute(path: string): Promise<void> {
    if (busy) { queue = { type: 'nav', path }; return } // 导航串行（快速连续导航排队——防竞态）
    busy = true
    try {
      const matched = match(routes, path)
      stream.emit(ev('route', 'change', undefined, { path, params: matched?.params ?? {} }))
      if (!matched) {
        root.innerHTML = '' // 无匹配 → 清空（404 由上层处理）
        current = null
        pageVnode = null
        return
      }
      pageCtx = makePageCtx() // 新页面新 ctx（render 绑定当前实例）
      // 动态路由参数注入（vdom2 语义：ctx.route.params——组件消费（Chat 的 deptId 等））
      ;(pageCtx as { route?: Record<string, unknown> }).route = {
        path,
        params: matched.params,
      }
      const page = matched.def.render(matched.params)
      const vnode = matched.def.layout ? matched.def.layout(page) : page
      // oldV 对照（current——同位置同类型复用 _render——layout 工厂不重跑）
      const built = await buildVNode(vnode, pageCtx, current, true)
      if (current == null) {
        mount(built, root) // 首帧
      } else {
        patch(current, built, root) // 页面切换（异类型 → COMP_UNMOUNT+REMOVE / MOUNT+CREATE）
      }
      current = built
      pageVnode = built
    } finally {
      busy = false
      if (queue != null) { const q = queue; queue = null; void runOp(q) }
    }
  }

  const onPopState = () => { void handleRoute(window.location.pathname) }
  // 路由导航监听统一走事件代理（全局注册表——EVENT_BIND/UNBIND 可观测）
  const offPop = addGlobalListener(window, 'popstate', onPopState as EventListener)

  // 初始路由
  const initial = options?.initialPath ?? window.location.pathname
  void handleRoute(initial)

  return {
    navigate(path: string): void {
      window.history.pushState(null, '', path)
      void handleRoute(path)
    },
    path: () => window.location.pathname,
    refresh: () => { void handleRoute(window.location.pathname) },
    close: () => { offPop() },
  }
}
