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

import type { VNode, VNodeChild, Component, CompVNode } from '../vnode.ts'
import { componentName, ctxVersion as getCtxVersion, setMounting, type VdomCtx, type VdomUi } from './ctx.ts'
import { createRegistry } from './registry.ts'
import { Fragment, arrayChildren, isFrag, isComp, isNative } from '../vnode.ts'
import { ensureId, type Registry } from './registry.ts'
import { transition, canReuse, vnodeTraceCtx } from './lifecycle.ts'
import { classifyKind, type VKind } from './kind.ts'
import { trace, traceEnabled, kidsSeq, vnDesc } from './trace.ts'
import { emit } from './events.ts'
import { auditEnabled } from './audit.ts'

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
  ctx: VdomCtx,
  reg: Registry,
  opts?: { reuse?: VNode | null },
): Promise<{ renderFn: (props: VNode['props']) => Promise<VNode | null>; childCtx: VdomCtx }> {
  const comp = vnode as import('../vnode.ts').CompVNode
  if (!comp._id) {
    // 旧树同位置同类型 → 复用旧 id（渲染定位锚点不漂移：剪枝新 vnode 若分配新 id，
    // 组件内部 render([selfId]) 会命中 registry 里的新 vnode——其 _parentNode 未设置 →
    // patch 错位 fallback rootEl → 整树被覆盖 → 重挂 → 动画/定时器重启 → 渲染风暴）
    if (opts?.reuse?._id) {
      comp._id = opts.reuse._id
    } else {
      comp._id = reg.nextId()
    }
    reg.idRegistry.set(comp._id, comp)
  }
  // 旧树同位置同类型：继承定位信息（_parentNode/_refNode——剪枝复用旧 _child 时新 vnode 需要
  // 正确的渲染容器；否则 renderByIds 的 parent 定位失败 → patch 错位）+ 版本号（_ctxVersion——
  // 剪枝版本比较基准：reuse 继承旧版本，版本没变才允许剪枝）
  if (opts?.reuse) {
    if (opts.reuse._parentNode) comp._parentNode = opts.reuse._parentNode
    if (opts.reuse._refNode) comp._refNode = opts.reuse._refNode
    if (opts.reuse._ctxVersion != null) comp._ctxVersion = opts.reuse._ctxVersion
  }
  const childCtx = Object.create(ctx) as VdomCtx
  childCtx.ui = Object.create(ctx.ui) as VdomUi & Record<string, unknown>
  const childUi = childCtx.ui as VdomUi & { _selfId?: string; _selfVNode?: VNode }
    childUi._selfId = comp._id ?? null
  ;(childUi as VdomUi & { _selfVNode?: VNode })._selfVNode = comp
  // render-only：闭包绑定渲染（无 this 陷阱——根治 §4.5 selfId 错位：重挂载/解构不影响）
  childUi.render = function (this: unknown, ids?: string[]): Promise<void> {
    const ui = ctx.ui
    if (ids == null && comp._id) return ui.render!([comp._id])
    return ui.render!(ids)
  }

  // 旧树同位置同类型复用（工厂不重跑——组件跨渲染保持内部状态）
  if (typeof comp._render !== 'function' && isComp(opts?.reuse) && typeof opts.reuse._render === 'function') {
    comp._render = opts.reuse._render
  }
  if (typeof comp._render !== 'function') {
    // mount 保护期：$ 初始化赋值不产生 dirty 标记
    setMounting(ctx, true)
    let renderFn: unknown
    try {
      renderFn = await (comp.type as Component)(comp.props ?? {}, childCtx as unknown as import('../types.ts').WfuiContext)
    } finally {
      setMounting(ctx, false)
    }
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${componentName(vnode.type)} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`,
      )
    }
    comp._render = renderFn as (props: VNode['props']) => Promise<VNode | null>
  }
  return { renderFn: comp._render as (props: VNode['props']) => Promise<VNode | null>, childCtx }
}

/** thenable 判定（buildVNode 返回值可能是同步值或 Promise） */
function isThenable(v: unknown): v is Promise<VNodeChild> {
  return !!v && typeof (v as { then?: unknown }).then === 'function'
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
/** 构建器签名（BUILDERS[kind]——kind 分派查表，无 if/else 类型链） */
type BuildFn = (
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput: VNodeChild | undefined,
  reg: Registry | undefined,
  opts: { force?: boolean } | undefined,
) => VNodeChild | Promise<VNodeChild>

/**
 * buildVNode — 构建分派入口（状态机查表：BUILDERS[classifyKind(input)]）。
 * hole/text 同步原样；arr 逐项递归；comp 异步工厂；frag/native/portal 同步递归 children。
 */
export function buildVNode(
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput?: VNodeChild,
  reg?: Registry,
  opts?: { force?: boolean },
): VNodeChild | Promise<VNodeChild> {
  return BUILDERS[classifyKind(input)](input, ctx, oldInput, reg, opts)
}

/** 旧树同位置同类型匹配（vnode 类型相同才可对照复用） */
function matchOldV(oldInput: VNodeChild | undefined, vnode: VNode): VNode | null {
  return oldInput != null && typeof oldInput === 'object' && !Array.isArray(oldInput) &&
    (oldInput as VNode).type === vnode.type
    ? (oldInput as VNode)
    : null
}

/** 构建状态机表（kind → 构建行为——与 render RENDERERS / ssr TO_HTML / hydrate HYDRATERS 同构） */
export const BUILDERS: Record<VKind, BuildFn> = {
  /** 占位/文本：同步原样返回（零构建） */
  hole: (input) => input,
  text: (input) => input,
  /** 数组：逐项递归（key 字符串化 + 旧树按 key/位置对照） */
  arr: buildArray,
  /** 组件：两阶段异步（剪枝命中同步零 await；否则工厂 await） */
  comp: buildComponent,
  /** Fragment：同步递归 children（无中间态 fresh → built） */
  frag: buildFragment,
  /** native：递归 children（string/symbol type） */
  native: buildNative,
  /** Portal：与 native 同构建路径（递归 children——现状一致） */
  portal: buildNative,
}

/** 数组构建：逐项递归——数组项 = 隐式 Fragment：vnode 保持用户结构（不展开——层级独立 key，
 *  规则表 §3-46）。key 业务身份声明协议：框架不生成身份 key——显式 key 仅字符串化；无 key 项
 *  保持 null（位置身份——patch 阶段由 pos: 显式接管混合数组，见 patch.ts） */
function buildArray(
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput: VNodeChild | undefined,
  reg: Registry | undefined,
  opts: { force?: boolean } | undefined,
): VNodeChild | Promise<VNodeChild> {
  const arr = input as VNodeChild[]
  if (traceEnabled('build')) trace('build', 'debug', '', `array in  kids=${kidsSeq(arr)}`)
  // 两阶段契约违反检测（audit——事件流）：新树数组出现 disposed vnode =
  // renderFn 复用了旧树对象（真实事故：Section 捕获 mount 期 props.children——
  // 同一 DemoCard vnode 既是旧树又被 dispose，重发后自 dispose → 卡片错位/消失）。
  // 正常新树项是 fresh vnode；disposed 只应出现在 oldInput 对照（重建恢复），
  // 出现在 new children 说明用户返回了被清理的旧引用。
  for (const c of arr) {
    if (c != null && typeof c === 'object' && !Array.isArray(c) && (c as VNode)._lifecycle === 'disposed') {
      const v = c as VNode
      emit({
        session: '', machine: 'audit', nodeId: v._id ?? null, component: componentName(v.type), from: 'disposed',
        event: 'CONTRACT_VIOLATION', to: 'new-tree', level: 'error', ts: Date.now(),
      })
      if (auditEnabled()) {
        console.error(
          `[vdom2/audit] 两阶段契约违反：组件 ${componentName(v.type)} 的 renderFn 返回了 disposed 旧 vnode` +
            `${v._id ? `(${v._id})` : ''}——复用旧树对象（应为每次渲染生成新 vnode）。` +
            `同一对象既是旧树又被 dispose → diff 自 dispose → 卡片错位/消失（demo 搜索恢复事故）`,
        )
      }
      break
    }
  }
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    if (c != null && typeof c === 'object' && !Array.isArray(c)) {
      const v = c as VNode
      if (v.key !== null) v.key = String(v.key)
    }
  }
  const oldArr = Array.isArray(oldInput) ? oldInput : []
  // 旧树对照按 key 匹配（keyed 数组——与 patch 的 keyed 匹配对齐）：位置对照在「增删」时
  // 错位（new[0] 可能是旧 B、位置 0 是旧 A——按位置复用 _render 让 B 实例继承 A 状态，
  // 全 keyed 头部删除身份错位的根因）；无 key 项（位置身份）按位置
  const oldByKey = new Map<string, VNodeChild>()
  for (const o of oldArr) {
    if (o != null && typeof o === 'object' && !Array.isArray(o) && (o as VNode).key != null) {
      oldByKey.set((o as VNode).key!, o)
    }
  }
  const jobs = arr.map((c, i) => {
    let oldMatch: VNodeChild | null = null
    if (c != null && typeof c === 'object' && !Array.isArray(c) && (c as VNode).key != null) {
      oldMatch = oldByKey.get((c as VNode).key!) ?? null
    }
    if (oldMatch == null) oldMatch = oldArr[i] ?? null
    return buildVNode(c, ctx, oldMatch, reg, opts)
  })
  if (traceEnabled('build')) trace('build', 'debug', '', `array out kids=${kidsSeq(arr)}`)
  // 全同步（剪枝/文本/已构建 native）→ 零微任务直接返回；含异步项 → Promise.all 并行
  let hasAsync = false
  for (let i = 0; i < jobs.length; i++) {
    if (isThenable(jobs[i])) { hasAsync = true; break }
  }
  if (hasAsync) return Promise.all(jobs).then(() => arr)
  return arr
}

/** 组件构建：P-1 公共轻量（同步——剪枝命中路径零 await 零 childCtx）→ 剪枝/完整路径 */
function buildComponent(
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput: VNodeChild | undefined,
  reg: Registry | undefined,
  opts: { force?: boolean } | undefined,
): VNodeChild | Promise<VNodeChild> {
  const vnode = input as VNode
  const registry = reg ?? ctx.__registry ?? createRegistry()
  const oldV = matchOldV(oldInput, vnode)
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
    if (isComp(vnode) && isComp(oldV) && typeof oldV._render === 'function') vnode._render = oldV._render
  }
  // ── 剪枝判断（前置——命中 = 纯同步 O(1)，不创建 childCtx 不 await） ──
  // force（renderByIds 显式渲染）→ 强制重跑 renderFn（读最新状态）
  // 生命周期检查（核心修复）：oldV 被 dispose 过（_lifecycle=disposed——diff 移除时
  // registry.ts 显式标记）→ 不剪枝 → 重新构建。dispose 掏空了旧树内容但引用保留，
  // 剪枝按引用（_child != null）误判可用 → 复用空壳 → diff 遇未构建组件（demo 搜索序列）
  const propsSame = componentPropsEqual(oldV?.props ?? {}, vnode.props ?? {})
  const ver = getCtxVersion(ctx)
  const verSame = (oldV?._ctxVersion ?? -1) === ver
  // canReuse：生命周期非 disposed + 旧 _child 有效（I3——统一复用检查）
  if (!opts?.force && propsSame && verSame && canReuse(oldV) && typeof (vnode as CompVNode)._render === 'function') {
    const ov = oldV! // canReuse(oldV) 保证非 null + _child 有效（TS 无法收窄——显式断言）
    vnode._lifecycle = transition(vnode._lifecycle, 'PRUNE', vnodeTraceCtx(vnode))
    vnode._child = ov._child
    vnode._ctxVersion = ov._ctxVersion
    if (traceEnabled('build')) trace('build', 'debug', '', `prune comp=${vnDesc(vnode)} propsSame=${propsSame} verSame=${verSame}`)
    return vnode
  }
  // ── 完整路径：mountAsyncComponent（await 工厂——组件两阶段异步契约不变） ──
  vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_START', vnodeTraceCtx(vnode))
  if (traceEnabled('build')) trace('build', 'debug', '', `mount comp=${vnDesc(vnode)} propsSame=${propsSame} verSame=${verSame} force=${!!opts?.force}`)
  return (async () => {
    const { childCtx } = await mountAsyncComponent(vnode, ctx, registry, { reuse: oldV ?? null })
    const built = await buildVNode(await (vnode as CompVNode)._render!(vnode.props), childCtx, oldV?._child, registry, opts)
    vnode._child = (built ?? null) as VNode | VNode[] | null
    vnode._ctxVersion = ver
    vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_DONE', vnodeTraceCtx(vnode))
    return vnode
  })()
}

/** Fragment 构建：同步递归 children（生命周期 fresh → built——native/Fragment 无中间态） */
function buildFragment(
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput: VNodeChild | undefined,
  reg: Registry | undefined,
  opts: { force?: boolean } | undefined,
): VNodeChild | Promise<VNodeChild> {
  const vnode = input as VNode
  const registry = reg ?? ctx.__registry ?? createRegistry()
  const oldV = matchOldV(oldInput, vnode)
  if (traceEnabled('build')) trace('build', 'debug', '', `fragment kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
  const r = buildVNode(vnode.props?.children ?? null, ctx, oldV?._child ?? oldV?.props?.children, registry, opts)
  if (isThenable(r)) {
    return r.then((built) => {
      vnode._child = (built ?? null) as VNode | VNode[] | null
      vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_DONE', vnodeTraceCtx(vnode))
      return vnode
    })
  }
  vnode._child = (r ?? null) as VNode | VNode[] | null
  vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_DONE', vnodeTraceCtx(vnode))
  return vnode
}

/** native 构建：递归 children（旧树同位置对照复用）——children 同步时同步设置 _child
 *  Portal 同路径（type 为 symbol——递归 props.children）；非法 type（数字等）原样返回 */
function buildNative(
  input: VNodeChild,
  ctx: VdomCtx,
  oldInput: VNodeChild | undefined,
  reg: Registry | undefined,
  opts: { force?: boolean } | undefined,
): VNodeChild | Promise<VNodeChild> {
  const vnode = input as VNode
  // 非法 type（非 string/symbol）→ 原样返回（诊断占位——与旧行为一致：不构建）
  if (typeof vnode.type !== 'string' && typeof vnode.type !== 'symbol') return vnode
  const registry = reg ?? ctx.__registry ?? createRegistry()
  const oldV = matchOldV(oldInput, vnode)
  if (traceEnabled('build')) trace('build', 'trace', '', `native <${String(vnode.type)}> kids=${kidsSeq(arrayChildren(vnode.props?.children))}`)
  const r = buildVNode(vnode.props?.children ?? null, ctx, oldV?.props?.children, registry, opts)
  if (isThenable(r)) {
    return r.then((built) => {
      vnode._child = (built ?? null) as VNode | VNode[] | null
      // 生命周期：同步构建路径 fresh → built（native/Fragment/Portal——含异步子项则 resolve 后标）
      vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_DONE', vnodeTraceCtx(vnode))
      return vnode
    })
  }
  vnode._child = (r ?? null) as VNode | VNode[] | null
  vnode._lifecycle = transition(vnode._lifecycle, 'BUILD_DONE', vnodeTraceCtx(vnode))
  return vnode
}
