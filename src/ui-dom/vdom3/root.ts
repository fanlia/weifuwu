/**
 * vdom3 root — 应用入口：createRoot（挂载 + 组件渲染上下文）
 *
 * 组件 ctx.render()：调度自身重渲染（同 tick 合并——一次 patch）。
 * 渲染流程：renderFn 重跑 → buildVNode（oldV 对照复用）→ patch（事件流 → DOM）。
 */

import type { VNode, V3Ctx } from './types.ts'
import { childrenOf } from './types.ts'
import { buildVNode } from './build.ts'
import { patch, mount, removeNodeWithLifecycle, removePortalContent, isPortalNode, registry } from './render.ts'
import type { PortalVNode } from './types.ts'
import { scheduler } from './scheduler.ts'
import { stream, ev } from './events.ts'
import { ensureDelegationRoot } from './delegate.ts'



export interface RootHandle {
  ctx: V3Ctx
  /** 组件重渲染（ctx.render 内部路径——同 tick 合并） */
  rerender(): void
  /** 立即刷新（测试） */
  flush(): void
  unmount(): void
  /** 首帧完成 Promise（初始挂载——工厂 await + 渲染落地） */
  ready: Promise<void>
}

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

/** 创建应用根（挂载组件树——组件获得 ctx.render 调度能力；options.ctx 注入扩展字段
 *  ——中间件面（app/i18n/auth/data 等——组件 ctx 可选链消费）） */
export function createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): RootHandle {
  let current = vnode

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
    if (updatingComps.has(compId)) { dirtyComps.add(compId); return }
    updatingComps.add(compId)
    try {
      do {
        dirtyComps.delete(compId)
        const comp = findComponent(current, compId)
        if (!comp || typeof comp.type !== 'function' || !comp._render) break
        stream.emit(ev('comp', 'render', comp._id!, { name: compNameOf(comp) }))
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
    if (updating) { dirty = true; return }
    updating = true
    try {
      do {
        dirty = false
        // 统一重建：buildVNode（组件根 → renderFn 重跑复用实例；native 根 → 全树递归；
        // oldV 对照复用 _render）→ patch（事件流 → DOM）
        const built = await buildVNode(vnode, ctx, current, true)
        if (current == null) {
          mount(built, root)
        } else {
          patch(current, built, root)
        }
        current = built
      } while (dirty)
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
      // COMP_UNMOUNT（根组件）
      if (current._id) {
        stream.emit(ev('comp', 'unmount', current._id, { name: 'root' }))
      }
      root.innerHTML = ''
    },
  }

  // 事件代理根（挂载点监听——每挂载点每事件一次——惰性注册）
  ensureDelegationRoot(root)

  // 初始挂载（组件构建——ctx 注入）
  void (async () => {
    try {
      const built = await buildVNode(vnode, ctx)
      mount(built, root)
      current = built
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
