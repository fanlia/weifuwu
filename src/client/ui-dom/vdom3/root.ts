/**
 * vdom3 root — 应用入口：createRoot（挂载 + 组件渲染上下文）
 *
 * 组件 ctx.render()：调度自身重渲染（同 tick 合并——一次 patch）。
 * 渲染流程：renderFn 重跑 → buildVNode（oldV 对照复用）→ patch（事件流 → DOM）。
 */

import type { VNode, V3Ctx } from './types.ts'
import { childrenOf } from './types.ts'
import { buildVNode } from './build.ts'
import { patch, mount, removeNodeWithLifecycle, removePortalContent, isPortalNode, registry, disposeTree } from './render.ts'
import type { PortalVNode } from './types.ts'
import { scheduler } from './scheduler.ts'
import { stream, ev } from './events.ts'
import { ensureDelegationRoot, removeDelegationRoot } from './delegate.ts'
import { getIndexedComponent } from './comp-index.ts'
import { auditDomEvents } from './audit.ts'
import type { RootHandle } from '../contracts/renderer.ts'

export type { RootHandle } from '../contracts/renderer.ts'

/** 组件名（事件可观测） */
function compNameOf(v: VNode): string {
  return typeof v.type === 'function' ? ((v.type as { name?: string }).name || 'anonymous') : 'anonymous'
}

/** 树中按组件 _id 定位（组件级更新的定位——DFS——含组件输出 _child） */
export function findComponent(v: VNode | null | undefined, compId: string): VNode | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null
  if ((v as VNode)._id === compId) return v as VNode
  // 组件输出（_child——组件的 childrenOf 不含输出——必须遍历）
  const child = (v as VNode)._child
  if (child != null && typeof child === 'object' && !Array.isArray(child)) {
    const found = findComponent(child as VNode, compId)
    if (found) return found
  }
  for (const c of childrenOf(v as VNode)) {
    if (c != null && typeof c === 'object' && !Array.isArray(c)) {
      const found = findComponent(c as VNode, compId)
      if (found) return found
    }
  }
  return null
}

/** 渲染耗时上报（round2 阶段 2——render:duration 事件 + 慢渲染 warn——
 *  性能黑盒透明：业务感知"卡"时知道哪次渲染/多慢——__v3SlowMs 阈值可配） */
function reportRenderDuration(sessionId: string | null, buildMs: number, patchMs: number): void {
  const ms = Math.round(buildMs + patchMs)
  stream.emit(ev('render', 'duration', sessionId ?? undefined, { ms, buildMs: Math.round(buildMs), patchMs: Math.round(patchMs) }))
  const slowMs = ((globalThis as { __v3SlowMs?: number }).__v3SlowMs ?? 100)
  if (ms > slowMs) {
    console.warn(`[vdom3/audit] 渲染耗时 ${ms}ms（build ${Math.round(buildMs)}ms + patch ${Math.round(patchMs)}ms）——session ${sessionId ?? '?'}——${slowMs}ms 以上视为慢渲染（__v3SlowMs 可调）`)
  }
}

/** 创建应用根（挂载组件树——组件获得 ctx.render 调度能力；options.ctx 注入扩展字段
 *  ——中间件面（app/i18n/auth/data 等——组件 ctx 可选链消费）） */
export function createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): RootHandle {
  let current = vnode
  // 根组件 vnode（buildVNode 克隆——原始 vnode 无 _id/_render——真实事故：
  // FilePreview 远程加载 ctx.render 无效——findComponent 找不到根组件）
  let rootComp: VNode | null = null

  // 渲染串行 + dirty 合并（async update 并发 → 同基于初始树 patch → 结构错乱；
  // 渲染中再次触发 → 标记 dirty → 完成后补跑一次读最新状态——防死循环）
  let updating = false
  let dirty = false

  // 组件级更新的 per-target 状态（组件间独立——A/B 并发不互锁；
  // 同组件渲染中再触发 → dirty 合并——完成后补跑）
  const updatingComps = new Set<string>()
  const dirtyComps = new Set<string>()

  /** 组件级精准更新（vdom2 语义：ctx.render 只刷新自身——事件流定位到组件——
   *  只重跑该组件 renderFn + patch 其输出——不碰整树/兄弟——避免全树 patch
   *  导致的全局 style 重设/布局抖动） */
  async function updateComponent(compId: string): Promise<void> {
    if (updatingComps.has(compId)) {
      // round3 阶段 2：调度透明——同组件渲染中再次触发 → 合并（排队可见）
      dirtyComps.add(compId)
      stream.emit(ev('render', 'queued', compId, { target: 'comp', cause: 'coalesced' }))
      return
    }
    updatingComps.add(compId)
    stream.emit(ev('render', 'flushed', compId, { target: 'comp', cause: 'manual' }))
    // 渲染会话（阶段 0：一次渲染的事件共享 session——按会话过滤/回放）
    stream.setSession()
    const sess = stream.currentSession()
    const t0 = performance.now()
    try {
      do {
        dirtyComps.delete(compId)
        // 根组件兜底：current 是输出树（不含根组件 vnode——buildVNode 克隆——
        // 根组件 ctx.render 的 findComponent 找不到自己——真实事故：
        // FilePreview 远程加载 render 无效）
        const comp = findComponent(current, compId) ?? (rootComp && rootComp._id === compId ? rootComp : null)
        if (!comp || typeof comp.type !== 'function' || !comp._render) {
          // 挂载中（rootComp 未设——fetch 微任务早于 mount 同步段）——排队补跑
          dirtyComps.add(compId)
          break
        }
        // 阶段 4（round2）：触发源可见——__WF_V3_STACK 调试模式——comp:render 带
        // 调用栈（谁触发了重渲染——事件回调/定时器/滚动一目了然）——默认关（栈开销）
        const withStack = (globalThis as { __WF_V3_STACK?: string }).__WF_V3_STACK === '1'
        stream.emit(ev('comp', 'render', comp._id!, {
          name: compNameOf(comp),
          ...(withStack ? { stack: new Error().stack?.split('\n').slice(2, 5).map((l) => l.trim().slice(0, 80)).join(' | ') } : {}),
        }))
        // await 挂起检测（挂起 = 静默失败——错误事件流必须覆盖；
        // 超时可配置：globalThis.__v3HangMs——测试/调试用短超时）
        const hm = ((globalThis as any).__v3HangMs ?? 3000)
        const output = await Promise.race([
          comp._render(comp.props),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`renderFn 挂起超时（${hm}ms）——组件 ${compId} 未 resolve`)), hm)),
        ])
        const oldOut = comp._child ?? null
        const built = output ? await Promise.race([
          buildVNode(output, ctx, oldOut ?? undefined),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`buildVNode 挂起超时（${hm}ms）——组件 ${compId} 输出构建未 resolve`)), hm)),
        ]) : null
        comp._child = built
        // patch 组件输出（组件 el 定位——只动该组件子树）
        const parent = (comp.el?.parentNode ?? root) as HTMLElement
        if (oldOut && built) {
          patch(oldOut, built, parent)
        } else if (built) {
          mount(built, parent)
        } else if (oldOut || comp.el) {
          // 输出变 null（条件移除）——统一生命周期清理（REMOVE + EVENT_UNBIND +
          // REF_CLEANUP——ref(null)——lockScroll 等卸载清理）
          if (oldOut && isPortalNode(oldOut)) {
            // Portal 输出：el 为 null（内容独立挂载）——走 portal 内容清理
            // （含 ref(null) 递归——popup 的 portalPanelRef → lockScroll 解锁）
            removePortalContent(oldOut as PortalVNode)
          } else {
            const oldEl = (oldOut && oldOut.el) || comp.el
            if (oldEl && oldEl.parentNode === parent) {
              removeNodeWithLifecycle(oldEl, parent, oldOut as VNode | null)
            }
          }
        }
        comp.el = built?.el ?? null
      } while (dirtyComps.has(compId))
    } catch (e) {
      // 组件级更新失败 → error:caught（事件流可观测——不中断渲染管线）
      const err = e as Error
      stream.emit(ev('error', 'caught', compId, { phase: 'update', name: 'component', message: err?.message ?? String(e) }))
    } finally {
      updatingComps.delete(compId)
    }
  }

  /** 整树重建（根级——native 根/路由等） */
  async function update(): Promise<void> {
    // 渲染会话（阶段 0——setSession 在最前——queued/flushed 也带同一 session）
    const sess = stream.setSession()
    if (updating) {
      // round3 阶段 2：调度透明——同 tick 渲染中再次触发 → 合并（排队可见）
      dirty = true
      stream.emit(ev('render', 'queued', undefined, { target: 'root', cause: 'coalesced' }))
      return
    }
    updating = true
    stream.emit(ev('render', 'flushed', undefined, { target: 'root', cause: 'manual' }))
    const t0 = performance.now()
    let tBuild = 0
    try {
      do {
        dirty = false
        // 统一重建：buildVNode（组件根 → renderFn 重跑复用实例；native 根 → 全树递归；
        // oldV 对照复用 _render）→ patch（事件流 → DOM）
        const built = await buildVNode(vnode, ctx, current, true)
        tBuild = performance.now() - t0
        if (current == null) {
          mount(built, root)
        } else {
          patch(current, built, root)
        }
        current = built
        rootComp = built
      } while (dirty)
      reportRenderDuration(sess, tBuild, performance.now() - t0 - tBuild)
    } finally {
      updating = false
    }
  }

  const ctx = Object.assign(Object.create(options?.ctx ?? null), {
    _vnode: vnode,
    _parent: root,
    render() {
      scheduler.schedule(() => void update())
    },
  }) as V3Ctx

  /** 组件级 render（组件 ctx 用——buildVNode 的 compCtx 绑定） */
  const componentRender = (compId: string) => {
    scheduler.schedule(() => void updateComponent(compId))
  }
  ;(ctx as any)._componentRender = componentRender

  // ready = 首帧完成 Promise
  let readyResolve!: () => void
  const ready = new Promise<void>((res) => { readyResolve = res })

  const handle: RootHandle = {
    ctx,
    ready,
    rerender: () => scheduler.schedule(() => void update()),
    flush: () => scheduler.flush(),
    unmount() {
      // dispose 协议（P3）：组件钩子/ref(null)/事件解绑/索引注销/portal 清空——树递归
      disposeTree(current)
      // 挂载点监听移除（removeEventListener 配对——delegate 残留消除）
      removeDelegationRoot(root)
      root.innerHTML = ''
    },
  }

  // 事件代理根（挂载点监听——每挂载点每事件一次——惰性注册）
  ensureDelegationRoot(root)
  // DOM↔事件流对照审计（dev 开关 __WF_VDOM_AUDIT='1'——无事件流不渲染的运行时守护）
  auditDomEvents(root, () => stream.events().slice(-200))

  // 初始挂载（组件构建——ctx 注入）
  void (async () => {
    // 首帧计时（round2 阶段 2——首帧慢也有 render:duration + 慢渲染 warn）
    stream.setSession()
    const sess0 = stream.currentSession()
    const t0 = performance.now()
    try {
      const built = await buildVNode(vnode, ctx)
      const tBuild0 = performance.now() - t0
      mount(built, root)
      current = built
      rootComp = built
      reportRenderDuration(sess0, tBuild0, performance.now() - t0 - tBuild0)
      // 挂载期间的组件 render 请求（fetch 微任务早于 mount——rootComp 未设被排队）补跑
      if (dirtyComps.size > 0) {
        for (const id of [...dirtyComps]) void updateComponent(id)
      }
    } catch (e) {
      // 初始挂载失败 → error:caught（事件流可观测——组件错误不静默——渲染可诊断）
      const err = e as Error
      stream.emit(ev('error', 'caught', (vnode as VNode)._id ?? 'root', { phase: 'mount', name: 'root', message: err?.message ?? String(e) }))
    } finally {
      readyResolve()
    }
  })()

  return handle
}
