/**
 * vdom core — component（组件渲染——两阶段工厂 + renderFn——独立文件）
 *
 * 模型（设计规则 §3——两阶段组件）：
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
import { removeVNodeTree, outputBase } from '../diff/cleanup.ts'
import type { Command } from '../command/index.ts'

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
  /** 渲染期 hook 基准（mount 阶段 hook 计数——渲染 hook 用其后空间——
   *  与 mount 的 usePopup 等分离——索引冲突根治） */
  renderBase: number
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
  emitCommand?: (cmd: Command) => void,
): Promise<boolean> {
  const factory = vn.type as Component

  // 实例记录（同位置同类型复用——工厂不重跑）
  let rec = registry.get(compId)
  // **类型检查**（统一——build/diff/emitWithKey 全部受益）：同位置不同
  // 类型（PageA2 → Panel 等）——旧实例卸载 + 重 mount（rec.type 错位事故）
  if (rec && rec.type !== factory) {
    disposeComponent(compId, registry)
    // **旧输出区间清理（G7——终态等价违例）**：lastOutput 数组/多根残留
    // （keyed 组件类型切换——dispose 后直接全量渲染——旧节点无 remove
    // ——fuzz 实证）——数组安全 + 组件项 unmount（与 diffSame 分支一致）
    if (rec.lastOutput !== undefined && emitCommand) {
      // **null 输出（空洞锚）同样清理（C2——`!== undefined`）**
      // **输出基线（C2——outIsComponent 特判 id 空间）**：输出组件的 DOM
      // 在 compId.0（sink 用 compId 作 parent）——清理基线必须一致
      removeVNodeTree(rec.lastOutput, outputBase(rec.lastOutput, compId, compId), compId, emitCommand, registry)
    }
    rec = undefined
  }
  const isNew = !rec
  if (!rec) {
    // per-instance ctx（共享面继承 + onUnmount 收集到实例记录 + hooks 注入面）
    const onUnmounts: (() => void)[] = []
    // hook 状态缓存（mount 与渲染分离——mount 的 usePopup 等占用 0..N；
    // 渲染期 hook（useControlledInput/useMedia）从 renderBase 起——
    // **真实 bug（AutoComplete 抓出）**：渲染期 hook idx=0 撞 mount 的
    // usePopup idx 0——读到 usePopup 的 state（无 keyword 字段——undefined
    // ——输入框显示 'undefined'）
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
      getSharedContext: () => sharedCtx ?? null,
    })
    // 工厂 = mount（一次——可 await ctx.data——管道保证 resolve）
    const maybeRenderFn = factory(vn.props, instCtx)
    rec = { type: factory, renderFn: await maybeRenderFn, onUnmounts, hookSeq, hookStates, renderBase: 0 }
    // **mount 阶段 hook 计数 → 渲染期基准**（渲染 hook idx = renderBase + seq）
    rec.renderBase = hookSeq.n
    registry.set(compId, rec)
  }

  // renderFn = 每次渲染（读最新 props——可 await——输出 null/数组/vnode）
  // **渲染期 hook 从 renderBase 起**（mount 的 usePopup 等占用 0..N——
  // 渲染 hook（useControlledInput/useMedia）用 mount 之后的空间——
  // 真实 bug（AutoComplete 抓出）：idx 撞 mount 的 usePopup——读到
  // usePopup 的 state（无 keyword 字段——undefined——输入框显示 'undefined'））
  rec.hookSeq.n = rec.renderBase
  const out = await rec.renderFn(vn.props)
  // 记录输出（diff 对照——同实例更新就地对上次输出 patch）
  rec.lastOutput = out
  // **组件输出挂自身 compId 子空间（C2——投影维度隔离）**：
  //  - **null/空洞输出 → compId.0（C2 修正——null 锚也挂子空间——否则
  //    锚在组件槽位（root.0）而转换路径的 remove 用 compId.0——基线错位
  //    ——旧锚残留 + insert 挂锚内（an:root.0(div) 实证——组件 fuzz
  //    seed=11 i=140）——统一：空洞/数组/组件输出全挂 compId 子空间）**
  //  - 数组输出（多根）→ compId.i（C2——与兄弟槽位隔离）
  //  - 单 vnode 组件输出 → compId.0（防 compId 冲突——HoverCard 事故）
  //  - 单 vnode 元素/文本输出 → 槽位 id（锚点法——compId = 锚点 id 语义）
  const outIsArray = Array.isArray(out)
  const outIsCompNode = typeof (out as VNode)?.type === 'function'
  const outIsHole = out === null || out === undefined || typeof out === 'boolean'
  await sink(out, outIsArray || outIsCompNode || outIsHole ? compId : parent, outIsArray || outIsCompNode || outIsHole ? 0 : index, ref)
  return isNew
}

/** 执行组件卸载（unmount 命令消费——onUnmounts 逆序执行）
 *  **递归清理子实例（G8——终态等价违例）**：组件 vnode 的 compId（parent.i）
 *  ≠ 其子树内子组件实例 id（parent.i.0 / parent.i.k{key} / compId.0 特判）——
 *  单实例删除会残留子实例（onUnmounts 不执行——订阅/监听泄漏——fuzz 实证）
 *  ——按 compId 前缀递归（LIFO——与 disposeAllComponents 同语义——先子后父） */
export function disposeComponent(id: string, registry: ComponentRegistry): void {
  const ids = [...registry.keys()].filter((k) => k === id || k.startsWith(id + '.')).reverse()
  for (const cid of ids) {
    const rec = registry.get(cid)
    if (!rec) continue
    for (const fn of rec.onUnmounts.reverse()) {
      try { fn() } catch (e) { console.error('[vdom] onUnmount:', e) }
    }
    registry.delete(cid)
  }
}
