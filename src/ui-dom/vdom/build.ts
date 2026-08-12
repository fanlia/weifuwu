/**
 * vdom/build — async 预构建（阶段 1）
 *
 * 核心不变量：
 * - 组件 vnode 构建后 `_render` 已设（工厂只跑一次）
 * - 旧树同位置同类型复用 `_render`（工厂不重跑——组件跨渲染保持内部状态）
 * - 剪枝：已构建 + props 同 + 旧 _child 有值 → 复用旧 _child（renderFn 不重跑）
 * - 兄弟组件并行（工厂同步执行到第一个 await 后并发等待）
 * - **纯函数无 DOM**——构建产物只含 vnode 树
 *
 * V3-2（同步快路径）：buildVNode 非 async——返回 `VNodeChild | Promise<VNodeChild>`。
 * **红线（用户确认）：组件两阶段异步定义不可改动**——组件 vnode 分支仍 await 工厂 +
 * renderFn（renderFn 强制异步契约不变）；仅「无需 await 的路径」（剪枝复用/文本/null/
 * 已构建 native）同步返回——零微任务。调用方统一 await 吸收（同步值 await 仅 1 微任务）。
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import { Fragment, arrayChildren } from '../vnode.ts'
import { ensureId, type Registry } from './registry.ts'
import { trace, traceEnabled, kidsSeq, vnDesc } from './trace.ts'

/** 组件 props 浅比较（三态 skip 判定） */
export function componentPropsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** 挂载 async 组件：await 工厂（两阶段：外层 mount 一次）→ 设 _render + 分配 id + childCtx */
export async function mountAsyncComponent(
  vnode: VNode,
  ctx: WfuiContext,
  reg: Registry,
  opts?: { reuse?: VNode },
): Promise<{ renderFn: (props: VNode['props']) => Promise<VNode | null>; childCtx: WfuiContext }> {
  if (!vnode._id) {
    // 旧树同位置同类型 → 复用旧 id（渲染定位锚点不漂移：剪枝新 vnode 若分配新 id，
    // 组件内部 render([selfId]) 会命中 registry 里的新 vnode——其 _parentNode 未设置 →
    // patch 错位 fallback rootEl → 整树被覆盖 → 重挂 → 动画/定时器重启 → 渲染风暴）
    if (opts?.reuse?._id) {
      vnode._id = opts.reuse._id
    } else {
      vnode._id = reg.nextId()
    }
    reg.idRegistry.set(vnode._id, vnode)
  }
  // 旧树同位置同类型：继承定位信息（_parentNode/_refNode——剪枝复用旧 _child 时新 vnode 需要
  // 正确的渲染容器；否则 renderByIds 的 parent 定位失败 → patch 错位）+ 版本号（_ctxVersion——
  // 剪枝版本比较基准：reuse 继承旧版本，版本没变才允许剪枝）
  if (opts?.reuse) {
    if (opts.reuse._parentNode) vnode._parentNode = opts.reuse._parentNode
    if (opts.reuse._refNode) vnode._refNode = opts.reuse._refNode
    if (opts.reuse._ctxVersion != null) vnode._ctxVersion = opts.reuse._ctxVersion
  }
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & Record<string, unknown>
  const childUi = childCtx.ui as WfuiContext['ui'] & { _selfId?: string; _selfVNode?: VNode }
  childUi._selfId = vnode._id
  childUi._selfVNode = vnode
  // render-only：闭包绑定渲染（无 this 陷阱——根治 §4.5 selfId 错位：重挂载/解构不影响）
  childUi.render = function (this: any, ids?: string[]): Promise<void> {
    if (ids == null && vnode._id) return ctx.ui.render([vnode._id])
    return ctx.ui.render(ids)
  }

  // 旧树同位置同类型复用（工厂不重跑——组件跨渲染保持内部状态）
  if (typeof vnode._render !== 'function' && typeof opts?.reuse?._render === 'function') {
    vnode._render = opts.reuse._render as (props: VNode['props']) => Promise<VNode | null>
  }
  if (typeof vnode._render !== 'function') {
    // mount 保护期：$ 初始化赋值不产生 dirty 标记
    ;(ctx.ui as any)?.setMounting?.(true)
    let renderFn: unknown
    try {
      renderFn = await (vnode.type as Component)(vnode.props ?? {}, childCtx)
    } finally {
      ;(ctx.ui as any)?.endMounting?.()
    }
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${(vnode.type as any).name || 'anonymous'} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`,
      )
    }
    vnode._render = renderFn as (props: VNode['props']) => Promise<VNode | null>
  }
  return { renderFn: vnode._render as (props: VNode['props']) => Promise<VNode | null>, childCtx }
}

/** thenable 判定（buildVNode 返回值可能是同步值或 Promise） */
function isThenable(v: unknown): v is Promise<VNodeChild> {
  return !!v && typeof (v as any).then === 'function'
}

/**
 * 递归展开组件树：await 工厂 → renderFn → 递归子树。**零 DOM**。
 *
 * - 组件节点保留在树上（挂 `_render` + `_child`）——$ dirty 精准刷新锚点不丢
 * - 兄弟组件 Promise.all 并行
 * - 旧树对照（oldInput）：同位置同类型组件复用旧 `_render`；同 props + 旧 _child 有值
 *   复用旧 `_child`（renderFn 不重跑——三态 skip 语义前置）
 * - 原地 mutate vnode（_render/_child）——引用保持
 * - V3-2：非 async——剪枝/文本/null/已构建 native 同步返回（零微任务）；
 *   组件路径（工厂 + renderFn await）返回 Promise（异步契约不变）
 */
export function buildVNode(
  input: VNodeChild,
  ctx: WfuiContext,
  oldInput?: VNodeChild,
  reg?: Registry,
  opts?: { force?: boolean },
): VNodeChild | Promise<VNodeChild> {
  if (input == null || typeof input === 'boolean' || typeof input === 'string' || typeof input === 'number') {
    return input
  }
  if (Array.isArray(input)) {
    // 数组项 = 隐式 Fragment：vnode 保持用户结构（不展开——层级独立 key，规则表 §3-46）。
    // 外层数组项 key：元素/组件项赋外层下标；数组项（内层数组）递归构建时独立分配（不跨层）
    if (traceEnabled('build')) trace('build', 'debug', '', `array in  kids=${kidsSeq(input)}`)
    for (let i = 0; i < input.length; i++) {
      const c = input[i]
      if (c != null && typeof c === 'object' && !Array.isArray(c)) {
        const v = c as VNode
        if (v.key === undefined) v.key = String(i)
        else v.key = String(v.key)
      }
    }
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    const jobs = input.map((c, i) => buildVNode(c, ctx, oldArr[i], reg, opts))
    if (traceEnabled('build')) trace('build', 'debug', '', `array out kids=${kidsSeq(input)}`)
    // 全同步（剪枝/文本/已构建 native）→ 零微任务直接返回；含异步项 → Promise.all 并行
    let hasAsync = false
    for (let i = 0; i < jobs.length; i++) {
      if (isThenable(jobs[i])) { hasAsync = true; break }
    }
    if (hasAsync) return Promise.all(jobs).then(() => input)
    return input
  }
  const vnode = input as VNode
  const registry = reg ?? ((ctx as any).__registry as Registry)
  const oldV =
    oldInput != null && typeof oldInput === 'object' && !Array.isArray(oldInput) &&
    (oldInput as VNode).type === vnode.type
      ? (oldInput as VNode)
      : null

  if (typeof vnode.type === 'function') {
    // ── P-1 公共轻量（同步——剪枝命中路径零 await 零 childCtx） ──
    if (!vnode._id) {
      // 旧树同位置同类型 → 复用旧 id（渲染定位锚点不漂移：剪枝新 vnode 若分配新 id，
      // 组件内部 render([selfId]) 会命中 registry 里的新 vnode——其 _parentNode 未设置 →
      // patch 错位 fallback rootEl → 整树被覆盖 → 重挂 → 动画/定时器重启 → 渲染风暴）
      vnode._id = oldV?._id ?? registry.nextId()
      registry.idRegistry.set(vnode._id, vnode)
    }
    // 旧树同位置同类型：继承定位信息（_parentNode/_refNode——剪枝复用旧 _child 时新 vnode
    // 需要正确的渲染容器；否则 renderByIds 的 parent 定位失败 → patch 错位）+ 版本号
    // （_ctxVersion——剪枝版本比较基准：reuse 继承旧版本，版本没变才允许剪枝）+ renderFn
    if (oldV) {
      if (oldV._parentNode) vnode._parentNode = oldV._parentNode
      if (oldV._refNode) vnode._refNode = oldV._refNode
      if (oldV._ctxVersion != null) vnode._ctxVersion = oldV._ctxVersion
      if (typeof oldV._render === 'function') vnode._render = oldV._render
    }
    // ── 剪枝判断（前置——命中 = 纯同步 O(1)，不创建 childCtx 不 await） ──
    // force（renderByIds 显式渲染）→ 强制重跑 renderFn（读最新状态）
    const propsSame = componentPropsEqual(oldV?.props ?? {}, vnode.props ?? {})
    const ctxVersion = (ctx as any)?.ui?._ctxVersion ?? 0
    const verSame = (oldV?._ctxVersion ?? -1) === ctxVersion
    if (!opts?.force && propsSame && verSame && oldV?._child != null) {
      vnode._child = oldV._child
      vnode._ctxVersion = oldV._ctxVersion
      if (traceEnabled('build')) trace('build', 'debug', '', `prune comp=${vnDesc(vnode)} propsSame=${propsSame} verSame=${verSame}`)
      return vnode
    }
    // ── 完整路径：mountAsyncComponent（await 工厂——组件两阶段异步契约不变） ──
    if (traceEnabled('build')) trace('build', 'debug', '', `mount comp=${vnDesc(vnode)} propsSame=${propsSame} verSame=${verSame} force=${!!opts?.force}`)
    return (async () => {
      const { childCtx } = await mountAsyncComponent(vnode, ctx, registry, { reuse: oldV ?? undefined })
      const built = await buildVNode(await vnode._render!(vnode.props), childCtx, oldV?._child, registry)
      vnode._child = (built ?? null) as VNode | VNode[] | null
      vnode._ctxVersion = ctxVersion
      return vnode
    })()
  }

  if (vnode.type === Fragment) {
    if (traceEnabled('build')) trace('build', 'debug', '', `fragment kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
    const r = buildVNode(vnode.props?.children ?? null, ctx, oldV?._child ?? oldV?.props?.children, registry)
    if (isThenable(r)) {
      return r.then((built) => { vnode._child = (built ?? null) as VNode | VNode[] | null; return vnode })
    }
    vnode._child = (r ?? null) as VNode | VNode[] | null
    return vnode
  }

  // Native：递归 children（旧树同位置对照复用）——children 同步时同步设置 _child
  if (typeof vnode.type === 'string' || typeof vnode.type === 'symbol') {
    if (traceEnabled('build')) trace('build', 'trace', '', `native <${String(vnode.type)}> kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
    const r = buildVNode(vnode.props?.children ?? null, ctx, oldV?.props?.children, registry)
    if (isThenable(r)) {
      return r.then((built) => { vnode._child = (built ?? null) as VNode | VNode[] | null; return vnode })
    }
    vnode._child = (r ?? null) as VNode | VNode[] | null
    return vnode
  }

  return vnode
}
