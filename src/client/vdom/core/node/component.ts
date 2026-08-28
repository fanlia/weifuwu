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
import { withTimeout, DEFAULT_ASYNC_TIMEOUT_MS } from '../async-guard.ts'
import { isHoleKind } from './index.ts'
import { beginRender, endRender } from '../../dev/effect-guard.ts'

/** 组件输出判别联合（**方案 3——null 结构性消除——编译器穷尽**）：
 *  - vnode：单节点输出（元素/组件/文本——挂槽位 id——锚点法）
 *  - hole：空洞输出（原 null——锚——挂 compId.0 子空间）
 *  - array：多根输出（挂 compId 子空间——与兄弟槽位隔离）
 *  消费点 switch(kind) 穷尽——遗漏分支 = 编译错误（而非运行时静默）——
 *  lastOutput 条件判断只用 `!== undefined`（hole 与真实输出同等处理——
 *  4 处 `!== null` 遗漏实证——an:root.0(div) 幽灵/锚残留） */
export type CompOutput =
  | { kind: 'vnode'; v: VNode }
  | { kind: 'hole' }
  | { kind: 'array'; items: VNodeChild[] }

/** 组件输出归一化（VNodeChild → CompOutput——null/undefined/boolean → hole） */
export function normalizeOutput(out: VNodeChild): CompOutput {
  // **判定点收敛（2026-08——kindOf 单一实现源）**：'' 组件输出 = hole
  // （kindOf 归空洞——旧判定不含 ''——输出形状分裂——emit 走 hole、
  // 输出形状走 text——id 空间错位风险）
  if (isHoleKind(out)) return { kind: 'hole' }
  if (Array.isArray(out)) return { kind: 'array', items: out }
  return { kind: 'vnode', v: out as VNode }
}

/** CompOutput → VNodeChild（清理/转换路径消费——outputBase 兼容） */
export function outputToChild(out: CompOutput): VNodeChild {
  if (out.kind === 'hole') return null
  if (out.kind === 'array') return out.items
  return out.v
}

/** 组件实例记录（跨渲染保持——diff 复用） */
export interface ComponentRecord {
  /** 组件函数引用（类型比较——同位置不同类型 → 卸载重建） */
  type: Component
  /** renderFn（工厂产物——每次渲染调用——读最新 props） */
  renderFn: RenderFn
  /** 卸载清理回调（ctx.onUnmount 收集——unmount 时执行） */
  onUnmounts: (() => void)[]
  /** 上次渲染输出（**判别联合 CompOutput**——diff 对照——同实例更新就地
   *  patch——不重建——undefined = 未渲染（首帧）；hole = 空洞锚——同等处理） */
  lastOutput?: CompOutput
  /** hook 调用顺序（渲染期重置——状态按 index 缓存） */
  hookSeq: { n: number }
  /** 渲染期 hook 基准（mount 阶段 hook 计数——渲染 hook 用其后空间——
   *  与 mount 的 usePopup 等分离——索引冲突根治） */
  renderBase: number
  /** hook 状态缓存（per-instance——useOpen 等渲染期 hooks） */
  hookStates: Map<number, unknown>
  /** 组件状态机阶段（**MOUNTING 补全——审计 2026-XX**）：工厂 await 期间
   *  = 'mounting'（rec 已注册——防御异步工厂重复执行/循环引用——重复
   *  引用等待挂载完成（B-2026-08——非违例）；mount 命令消费后 = 'mounted'） */
  phase: 'mounting' | 'mounted'
  /** 挂载完成信号（B-2026-08——mounting 期间重复引用等待——挂载完成
   *  或失败后 resolve——等待者重试渲染） */
  ready?: Promise<void>
}

/** 组件实例注册表（uiServe 持有——renderToStream 写入——diff/unmount 消费） */
export interface ComponentRegistry {
  get(id: string): ComponentRecord | undefined
  set(id: string, rec: ComponentRecord): void
  delete(id: string): void
  /** 全部实例 id（整树替换遍历卸载） */
  keys(): string[]
  /** 异步超时（R2——mount 工厂/renderFn await 上限——测试可注入短值） */
  asyncTimeout: number
}

/** 创建注册表（per serve 实例）——asyncTimeout 默认 15s（async-guard） */
export function createComponentRegistry(): ComponentRegistry {
  const map = new Map<string, ComponentRecord>()
  return {
    get: (id) => map.get(id),
    set: (id, rec) => { map.set(id, rec) },
    delete: (id) => { map.delete(id) },
    keys: () => [...map.keys()],
    asyncTimeout: DEFAULT_ASYNC_TIMEOUT_MS,
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
  // **MOUNTING 态防御（状态机——审计）**：工厂 await 期间同组件被再次
  // 引用（异步循环依赖）——**修复（B-2026-08）**：不再 throw——**等待
  // mount 完成**（mountingRec 带 ready promise——工厂完成后 resolve）——
  // 工厂执行期间 ctx.render()（Deliverables 的 load() 首行 rerender 实证）
  // 二次渲染到同组件——进程违例中断渲染（DOM 空态）——等待后递归重试
  // 本渲染（mount 完成后 renderFn 可用）——真实挂起（非错误）
  if (rec && rec.phase === 'mounting') {
    // 循环依赖真违例（工厂引用自己）在外层 build await 挂起重试——
    // 用 ready 信号周期；若同渲染周期内自引用（无外部驱动）→ 超时兜底
    await rec.ready
    return renderComponent(vn, parent, index, ref, compId, sharedCtx, registry, sink, emitCommand)
  }
  // **类型检查**（统一——build/diff/emitWithKey 全部受益）：同位置不同
  // 类型（PageA2 → Panel 等）——旧实例卸载 + 重 mount（rec.type 错位事故）
  if (rec && rec.type !== factory) {
    disposeComponent(compId, registry)
    // **旧输出区间清理（G7——终态等价违例）**：lastOutput 数组/多根残留
    // （keyed 组件类型切换——dispose 后直接全量渲染——旧节点无 remove
    // ——fuzz 实证）——数组安全 + 组件项 unmount（与 diffSame 分支一致）
    if (rec.lastOutput !== undefined && emitCommand) {
      // **判别联合（方案 3）**：hole/array/vnode 统一转换后清理——
      // 基线 outputBase（hole → compId.0 / array → compId / vnode → 槽位）
      const child = outputToChild(rec.lastOutput)
      removeVNodeTree(child, outputBase(child, compId, compId), compId, emitCommand, registry)
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
    const instData = new Map<unknown, unknown>()
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
      getInstanceData: () => instData,
      scheduleAfterRender: (fn) => sharedCtx.afterRender?.(fn),
      getSharedContext: () => sharedCtx ?? null,
    })
    // 工厂 = mount（一次——可 await ctx.data——管道保证 resolve）
    // **MOUNTING 占位注册（状态机——审计）**：工厂执行前先注册（异步工厂
    // await 期间同组件重复引用 → 检测 mounting 显式报错——循环依赖防御）
    // **B-修复（2026-08）**：占位带 ready promise——mounting 期间的重复
    // 引用等待而非报错（Deliverables 空态根因——工厂内 ctx.render()）
    let resolveReady!: () => void
    const ready = new Promise<void>((r) => { resolveReady = r })
    const mountingRec = { type: factory, renderFn: (() => null) as RenderFn, onUnmounts, hookSeq, hookStates, renderBase: 0, phase: 'mounting' as const, ready }
    registry.set(compId, mountingRec)
    let renderFn: RenderFn
    try {
      // **mount 失败清理（R1 探索发现——mounting 占位残留**）：同步 throw
      // 与 async reject（async 工厂 = Promise reject——不在同步 try 内）
      // 统一清理——占位不删 → 下次渲染同位置 → rec.phase==='mounting' →
      // "正在 mount" 违例 throw——错误不再是根因（用户代码错误被掩盖——
      // 后续全是状态机违例——e2e 探针实证：mount boom → 2× 违例连锁）
      const maybeRenderFn = factory(vn.props, instCtx)
      renderFn = await withTimeout(
        Promise.resolve(maybeRenderFn),
        registry.asyncTimeout,
        `mount(${compId})`,
      )
    } catch (e) {
      registry.delete(compId)
      resolveReady() // B-修复（2026-08）：mount 失败也 release 等待者（否则悬挂）
      for (const fn of onUnmounts.reverse()) { try { fn() } catch (e2) { console.error('[vdom] mount 清理:', e2) } }
      throw e
    }
    rec = { type: factory, renderFn, onUnmounts, hookSeq, hookStates, renderBase: 0, phase: 'mounted' }
    // **B-修复（2026-08）**：mount 完成——release mounting 等待者（重复引用
    // 的渲染重试）
    resolveReady()
    // **mount 阶段 hook 计数 → 渲染期基准**（渲染 hook idx = renderBase + seq）
    rec.renderBase = hookSeq.n
    // **MOUNTING 态提前注册（状态机——审计）**：工厂执行前先注册 mounting
    // 占位（异步工厂 await 期间同组件重复引用 → 显式报错——循环依赖防御）
    // ——await 完成后立即 mounted（工厂完成即可复用——mount 命令是消费端
    // 确认——生成端视角 mounting 窗口 = 工厂 await 期间）
    registry.set(compId, rec)
  }

  // renderFn = 每次渲染（读最新 props——可 await——输出 null/数组/vnode）
  // **渲染期 hook 从 renderBase 起**（mount 的 usePopup 等占用 0..N——
  // 渲染 hook（useControlledInput/useMedia）用 mount 之后的空间——
  // 真实 bug（AutoComplete 抓出）：idx 撞 mount 的 usePopup——读到
  // usePopup 的 state（无 keyword 字段——undefined——输入框显示 'undefined'））
  rec.hookSeq.n = rec.renderBase
  // **renderFn 超时防御（R2）**：renderFn 挂起 → **组件级 hole 降级**（单组件
  // 失败不炸整树——队列继续——下一拍重试自愈）。
  // 注意：超时 reject 后 rec 保持 mounted（未销毁——重试路径复用工厂）
  let out: VNode | null | (VNode | null)[]
  try {
    // **渲染路径副作用守卫（2026-08——窗口 = renderFn 同步执行段）**：
    // begin → 调用（async 函数同步执行到首个 await）→ end——**await 挂起期
    // 的事件回调（点击复制等）不属于渲染路径——窗口已闭——零误报零豁免**
    // ——withTimeout 的超时 timer 也在窗口外创建（await 包装在 end 之后）
    beginRender()
    let renderP: ReturnType<RenderFn>
    try {
      renderP = rec.renderFn(vn.props)
    } finally {
      endRender()
    }
    out = await withTimeout(Promise.resolve(renderP), registry.asyncTimeout, `renderFn(${compId})`)
  } catch (e) {
    console.error(`[vdom] renderFn 超时/错误（${compId}）——组件级 hole 降级（下一拍重试自愈）:`, e)
    out = null
  }
  // 记录输出（**归一化为判别联合——null 结构性消除**）
  rec.lastOutput = normalizeOutput(out)
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
  const outIsHole = isHoleKind(out)
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
