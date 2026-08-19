/**
 * vdom core — component（组件渲染——两阶段工厂 + renderFn——独立文件）
 *
 * 模型（AGENTS §3——两阶段组件）：
 * ```ts
 * Component<P, C> = (initProps, ctx) => RenderFn<P> | Promise<RenderFn<P>>
 * RenderFn<P> = (props) => VNode | null | Promise<VNode | null>
 * ```
 * - 工厂 = mount（一次——初始化状态/订阅/数据预取（await ctx.data——管道保证））
 * - renderFn = 每次渲染（读最新 props——同步或 async——异步边界 = ctx.data）
 *
 * 渲染流集成（render.ts 消费）：
 * - 工厂调用（可 await）→ renderFn 调用（可 await）→ 输出 vnode 递归 emit
 *   （null → 空洞占位；数组 → 隐式 Fragment；元素/组件嵌套）
 * - per-instance ctx：Object.create(shared) + onUnmount 覆盖——收集回调
 *   到实例记录（组件卸载时执行——unmount 命令由 diff 发出）
 * - 实例记录注册表（compId → { renderFn, onUnmounts }）——同位置同类型
 *   组件复用（工厂不重跑——let/ref 状态保持——diff 消费）
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import type { Component, RenderFn } from '../vnode.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { createUi } from '../../hooks/env.ts'
import type { Browser } from '../../browser/Browser.ts'

/** 组件实例记录（跨渲染保持——diff 复用） */
export interface ComponentRecord {
  /** 组件函数引用（类型比较——同位置不同类型 → 卸载重建） */
  type: Component
  /** renderFn（工厂产物——每次渲染调用——读最新 props） */
  renderFn: RenderFn
  /** 卸载清理回调（ctx.onUnmount 收集——unmount 时执行） */
  onUnmounts: (() => void)[]
  /** 上次渲染输出（diff 对照——同实例更新就地 patch——不重建） */
  lastOutput?: VNodeChild | null
  /** hook 调用顺序（渲染期重置——状态按 index 缓存） */
  hookSeq: { n: number }
  /** hook 状态缓存（per-instance——useOpen 等渲染期 hooks） */
  hookStates: Map<number, unknown>
}

/** 组件实例注册表（uiServe 持有——renderToStream 写入——diff/unmount 消费） */
export interface ComponentRegistry {
  get(id: string): ComponentRecord | undefined
  set(id: string, rec: ComponentRecord): void
  delete(id: string): void
  /** 全部实例 id（整树替换遍历卸载） */
  keys(): string[]
}

/** 创建注册表（per serve 实例） */
export function createComponentRegistry(): ComponentRegistry {
  const map = new Map<string, ComponentRecord>()
  return {
    get: (id) => map.get(id),
    set: (id, rec) => { map.set(id, rec) },
    delete: (id) => { map.delete(id) },
    keys: () => [...map.keys()],
  }
}

/** 整树替换：全部组件实例卸载（**LIFO——后挂载先卸载**——导航/root
 *  类型变化——与单组件 onUnmounts 逆序一致——栈语义） */
export function disposeAllComponents(registry: ComponentRegistry): void {
  for (const id of [...registry.keys()].reverse()) disposeComponent(id, registry)
}

/** 组件渲染 sink（render.ts 的 emit——子节点递归出口） */
export type ComponentSink = (
  v: VNodeChild, parent: string, index: number, ref: string | null,
) => Promise<void>

/** 渲染一个组件（mount + renderFn——可 await——输出经 sink 递归 emit） */
export async function renderComponent(
  vn: VNode,
  parent: string,
  index: number,
  ref: string | null,
  compId: string,
  sharedCtx: UIContext,
  registry: ComponentRegistry,
  sink: ComponentSink,
): Promise<boolean> {
  const factory = vn.type as Component

  // 实例记录（同位置同类型复用——工厂不重跑）
  let rec = registry.get(compId)
  // **类型检查**（统一——build/diff/emitWithKey 全部受益）：同位置不同
  // 类型（PageA2 → Panel 等）——旧实例卸载 + 重 mount（rec.type 错位事故）
  if (rec && rec.type !== factory) {
    disposeComponent(compId, registry)
    rec = undefined
  }
  const isNew = !rec
  if (!rec) {
    // per-instance ctx（共享面继承 + onUnmount 收集到实例记录 + hooks 注入面）
    const onUnmounts: (() => void)[] = []
    // hook 状态缓存（渲染期调用——按调用顺序 index——per-instance）
    const hookStates = new Map<number, unknown>()
    const hookSeq = { n: 0 }
    const instCtx = Object.create(sharedCtx) as UIContext
    instCtx.onUnmount = (fn) => { onUnmounts.push(fn) }
    // hooks 注入面（ctx.ui——env 绑定当前组件实例）
    instCtx.ui = createUi({
      requestRender: () => { void instCtx.render?.() },
      onUnmount: (fn) => { onUnmounts.push(fn) },
      getBrowser: () => sharedCtx.browser ?? null,
      nextHookIndex: () => hookSeq.n++,
      getHookState: <T>(idx: number) => hookStates.get(idx) as T | undefined,
      setHookState: (idx, v) => { hookStates.set(idx, v) },
      scheduleAfterRender: (fn) => sharedCtx.afterRender?.(fn),
    })
    // 工厂 = mount（一次——可 await ctx.data——管道保证 resolve）
    const maybeRenderFn = factory(vn.props, instCtx)
    rec = { type: factory, renderFn: await maybeRenderFn, onUnmounts, hookSeq, hookStates }
    registry.set(compId, rec)
  }

  // renderFn = 每次渲染（读最新 props——可 await——输出 null/数组/vnode）
  rec.hookSeq.n = 0 // 渲染期 hook 调用顺序重置（状态按 index 缓存保持）
  const out = await rec.renderFn(vn.props)
  // 记录输出（diff 对照——同实例更新就地对上次输出 patch）
  rec.lastOutput = out
  await sink(out, parent, index, ref)
  return isNew
}

/** 执行组件卸载（unmount 命令消费——onUnmounts 逆序执行） */
export function disposeComponent(id: string, registry: ComponentRegistry): void {
  const rec = registry.get(id)
  if (!rec) return
  for (const fn of rec.onUnmounts.reverse()) {
    try { fn() } catch (e) { console.error('[vdom] onUnmount:', e) }
  }
  registry.delete(id)
}
