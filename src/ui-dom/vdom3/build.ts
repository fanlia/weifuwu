/**
 * vdom3 build — 异步组件构建（两阶段组件 → 纯 vnode 树）
 *
 * 与 vdom2 同模型：先 await 组件工厂 + renderFn → 构建产物（纯树）→ 同步渲染。
 * 组件实例复用：同位置同类型（patch 判定）→ 工厂不重跑（内部状态保持）。
 */

import type { VNode, VNodeChild, Component, PortalVNode, V3Ctx } from './types.ts'
import { Fragment, Portal, App, childrenOf } from './types.ts'
import { stream, ev, nextNodeId } from './events.ts'
import { createClientBrowser } from '../browser.ts'
import { indexComponent } from './comp-index.ts'
import { getAppFactory } from './app.ts'
import type { AppVNode } from './types.ts'
import { createV3Ui } from './ui.ts'

/** 组件卸载钩子注册表（组件 id → 清理函数——COMP_UNMOUNT 时调用） */
const unmountHooks = new Map<string, () => void>()

export function runUnmountHooks(id: string): void {
  const h = unmountHooks.get(id)
  if (h) { try { h() } catch { /* 清理错误隔离 */ } unmountHooks.delete(id) }
}

export function isVNode(v: unknown): v is VNode {
  return v != null && typeof v === 'object' && !Array.isArray(v) && 'type' in v
}

/** props 内容快照（透明度 round2 阶段 1——dev only）：引用类型字段 JSON 序列化——
 *  对比上次快照检测"内容变但引用没变"（业务原地改对象——Chat 空 bubble 事故变体） */
function propsSnap(props: Record<string, unknown>): string | null {
  try {
    const picked: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(props)) {
      // 仅引用类型（对象/数组）——函数/原始值跳过（引用比较已覆盖）
      if (v != null && typeof v === 'object') {
        const s = JSON.stringify(v)
        if (s != null && s.length <= 10000) picked[k] = s // 大小防御（>10KB 跳过）
      }
    }
    return Object.keys(picked).length > 0 ? JSON.stringify(picked) : null
  } catch { return null }
}
// 内容变更告警去重（同组件同 key——dev 常亮不刷屏——只在真发生时提示）
const warnedContentChange = new Set<string>()

/** props 浅比较（剪枝——vdom2 componentPropsEqual 补齐）：引用比较（含函数——
 *  稳定引用纪律 §3.1：mount 层定义回调——render 内定义的新函数导致重渲染） */
function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** 构建 vnode 树（组件展开——异步；native/text 同步递归）——**纯函数式**：
 *  每层返回克隆（不就地修改入参）——update 的对照树（current）不被污染。
 *  oldV：旧树同位置对照——同类型组件复用 _render（工厂不重跑——内部状态保持）。
 *  isRoot：整树 rerender（createRoot/router 顶层）——根组件不剪枝（内部状态
 *  （闭包 let）变化时 props 不变——剪枝跳过 renderFn = 读旧闭包值；根必须重跑。
 *  嵌套剪枝保留：子组件内部状态由自身 ctx.render（组件级——绕开 build）维护，
 *  父重跑时剪枝复用其最新输出——安全。 */
export async function buildVNode(vnode: VNode, ctx: V3Ctx, oldV?: VNode | null, isRoot = false): Promise<VNode> {
  if (typeof vnode.type === 'function' || (vnode.type === App)) {
    // 克隆（组件实例字段 _render/_id/_child 写克隆——旧树保持完整）
    const v = { ...vnode } as VNode
    // ── app 节点（多应用加载——应用编排） ──
    if (vnode.type === App) {
      return buildAppNode(v as AppVNode, ctx, oldV as AppVNode | null)
    }
    const reuse = oldV != null && typeof oldV === 'object' && oldV.type === vnode.type && oldV.key === vnode.key && oldV._render
      ? oldV
      : null
    if (reuse) {
      v._render = reuse._render
      v._id = reuse._id
      indexComponent(v)
      // props 级 diff（剪枝）：新旧 props 浅比较——不变 → 复用旧输出（不重跑 renderFn——
      // 零 RENDER——父重渲染不波及 props 未变的子组件）；根组件不剪枝（isRoot——
      // 内部状态变化必须重跑 renderFn）
      if (!isRoot && propsEqual(reuse.props, v.props)) {
        v._child = reuse._child
        // 剪枝克隆继承 el（否则 patch 时 ov.el 缺失 → 降级重建 → 重建项插末尾——
        // 审计抓出的 children 顺序错位（统计页 grid 每次重建的真实 bug））
        if (reuse.el != null) v.el = reuse.el
        // 透明度 round2 阶段 1（dev only）：内容变但引用没变检测——快照对比
        // （业务原地改 props 对象（Object.assign/数组 push）——剪枝跳过——渲染不更新）
        if ((globalThis as { __WF_V3_AUDIT?: string }).__WF_V3_AUDIT !== '0' && reuse._propsSnap != null) {
          const cur = propsSnap(v.props)
          if (cur != null && cur !== reuse._propsSnap) {
            const key = `${compName(v.type)}:${cur.slice(0, 40)}`
            if (!warnedContentChange.has(key)) {
              warnedContentChange.add(key)
              console.warn(
                `[vdom3/audit] 组件 ${compName(v.type)} 的 props 对象内容已变但引用未变` +
                `（原地修改对象？）——剪枝将跳过重渲染——请新建对象传 props（props 不可变契约）`,
              )
            }
          }
        }
        // BUILD 事件（透明度 A.1——剪枝决策可见）：reason 'reuse-skip'——
        // props 浅比较相同 → 复用旧输出（零 RENDER）——业务排查"渲染没更新"时
        // 一眼看到此原因（= 契约：props 引用未变——需新建对象触发）
        stream.emit(ev('comp', 'build', v._id!, { name: compName(v.type), reused: true, index: true, reason: 'reuse-skip', propsKeys: Object.keys(v.props) }))
        v._propsSnap = propsSnap(v.props)
        return v
      }
      // props 变化 → 驱动重渲染（PROPS_UPDATE 事件——变化的 key 可观测）
      const changedKeys = Object.keys({ ...reuse.props, ...v.props }).filter((k) => reuse.props[k] !== v.props[k])
      stream.emit(ev('props', 'update', v._id!, { name: compName(v.type), keys: changedKeys }))
      v._propsSnap = propsSnap(v.props)
      // BUILD 事件（透明度 A.1）：reason 'props-changed'（props 变重跑）/
      // 'root-render'（根组件——内部状态变化必须重跑——即使 props 未变）
      stream.emit(ev('comp', 'build', v._id!, { name: compName(v.type), reused: true, index: true, reason: isRoot ? 'root-render' : 'props-changed', changedKeys }))
    } else {
      v._id = nextNodeId()
      indexComponent(v)
      stream.emit(ev('comp', 'build', v._id, { name: compName(v.type), reused: false, index: true, reason: 'mount' }))
      stream.emit(ev('comp', 'mount', v._id, { name: compName(v.type) }))
      // 组件 ctx：onUnmount 钩子（卸载清理注册——COMP_UNMOUNT 时执行）
      // + ui（vdom2 兼容面——hooks shim——组件库零改动）
      const compId = v._id
      // Object.create 保留原型链（vdom2 extendCtx 中间件组合——spread 会丢失链上字段）
      // 组件级更新：ctx.render/ui.render 绑定"本组件"（vdom2 语义——只刷新自身——
      // 不触发整树 patch）——_componentRender 由 createRoot/router 注入
      // 注意：reuse 时工厂不重跑——componentRender 闭包捕获 compId（稳定）
      const componentRender = () => {
        ;(window as any).__chain = 'componentRender:' + compId
        const fn = (ctx as { _componentRender?: (id: string) => void })._componentRender
        if (fn) { ;(window as any).__chain = 'fn(' + compId + ')'; fn(compId) }
        else { ;(window as any).__chain = 'ctx.render(' + compId + ')'; ctx.render() }
      }
      const compCtx = Object.assign(Object.create(ctx), {
        render: componentRender,
        onUnmount: (fn: () => void) => { unmountHooks.set(compId, fn) },
        // 浏览器环境抽象：默认注入（createClientBrowser 惰性 typeof 防御——
        // SSR 下 document undefined → null/no-op——组件 36 处 ctx.browser 消费
        // 无需各自 fallback（Tour 曾因 ctx.browser 缺失 → query 返回 undefined →
        // targetEl 永不赋值 → rect 恒 0 → 引导高亮定位失效）
        browser: createClientBrowser(),
        ui: createV3Ui(compId, componentRender, (fn) => { unmountHooks.set(compId, fn) }),
      }) as V3Ctx
      // 组件工厂：失败 → error:throw（事件流可观测——工厂 reject 不静默）
      let renderFn: ((props: Record<string, unknown>) => Promise<VNode | null>) | null = null
      try {
        renderFn = (await (v.type as Component)(v.props, compCtx)) as (props: Record<string, unknown>) => Promise<VNode | null>
      } catch (e) {
        const err = e as Error
        stream.emit(ev('error', 'throw', v._id, { phase: 'factory', name: compName(v.type), message: err?.message ?? String(e) }))
        throw e // 保持传播——上层（updateComponent/handleRoute）捕获并记录
      }
      v._render = renderFn
      v._propsSnap = propsSnap(v.props) // 透明度 round2 阶段 1：首次也记录快照（对比基线）
    }
    // RENDER 事件：jsx 层——组件 renderFn 执行（每次渲染可观测——更新链路）
    stream.emit(ev('comp', 'render', v._id!, { name: compName(v.type) }))
    // renderFn：失败 → error:throw（事件流可观测——渲染失败可定位到组件与环节）
    let output: VNode | null = null
    try {
      output = await v._render!(v.props)
    } catch (e) {
      const err = e as Error
      stream.emit(ev('error', 'throw', v._id, { phase: 'renderFn', name: compName(v.type), message: err?.message ?? String(e) }))
      throw e
    }
    v._child = null
    const oldOut = reuse?._child ?? null
    if (output) {
      // 输出递归构建——_child 存克隆（渲染链完整：克隆输出含全部子克隆）
      const built = await buildVNode(output, ctx, oldOut != null && typeof oldOut === 'object' ? (oldOut as VNode) : null)
      v._child = built
    }
    return v
  }
/** app 节点构建（多应用加载——不隔离设计）：
 *  - 注册表查工厂（未注册 → app:error unknown-app——占位 children）
 *  - 应用实例复用（同 appId 旧节点——工厂不重跑——_appOutput 缓存）
 *  - 子应用根 vnode → 共享 build 管线（父流构建——全链路可观测）
 *  - 边界事件：app:mount（首次）/ app:update（props 变化——payload keys） */
async function buildAppNode(v: AppVNode, ctx: V3Ctx, oldV: AppVNode | null): Promise<VNode> {
  const appId = String(v.props?.appId ?? '')
  const factory = getAppFactory(appId)
  if (!factory) {
    stream.emit(ev('app', 'error', undefined, { appId, reason: 'unknown-app' }))
    return v // 占位（children 原样——骨架屏/错误提示由调用方 children 决定）
  }
  // 应用实例复用（同 appId——_appOutput 缓存——工厂不重跑）
  const reuse = oldV != null && oldV.type === App && oldV.appId === appId
  if (!reuse || !oldV._appOutput) {
    stream.emit(ev('app', 'mount', undefined, { appId }))
    const output = await factory((v.props?.props as Record<string, unknown>) ?? {}, ctx)
    v._appOutput = output
  } else {
    v._appOutput = oldV._appOutput
    // props 变化 → app:update（可观测——payload keys）
    const oldP = (oldV.props?.props as Record<string, unknown>) ?? {}
    const newP = (v.props?.props as Record<string, unknown>) ?? {}
    const changed = [...new Set([...Object.keys(oldP), ...Object.keys(newP)])].filter((k) => oldP[k] !== newP[k])
    if (changed.length > 0) stream.emit(ev('app', 'update', undefined, { appId, keys: changed }))
  }
  // 子应用根在父流构建（共享管线——全链路可观测）
  const oldOut = reuse ? (oldV._appOutput ? await buildVNode(oldV._appOutput, ctx, null) : null) : null
  const built = v._appOutput ? await buildVNode(v._appOutput, ctx, oldOut) : null
  v._child = built
  v.appId = appId
  return v
}

  // native / Fragment / Portal：递归 children（跳过文本）——克隆 + 新 children 数组
  const oldKids = childrenOf(oldV ?? ({} as VNode))
  let i = 0
  let newKids: VNodeChild[] | null = null
  for (const c of childrenOf(vnode)) {
    if (isVNode(c)) {
      const oc = oldKids[i]
      const built = await buildVNode(c, ctx, oc != null && typeof oc === 'object' ? (oc as VNode) : null)
      if (built !== c) { newKids ??= [...childrenOf(vnode)]; newKids[i] = built }
    }
    i++
  }
  // 结构共享：children vnode 全无变化 + props/文本也无变化 → 复用旧引用
  // （零克隆零分配——patch 顶层同引用跳过——静态分支零 diff）。
  // 条件必须含 props 浅比较 + children（含文本）逐项比较——否则旧 props/文本
  // 残留（count 文本变化被复用旧树吞掉——真实回归）。
  // 纯函数式不变量保持：入参 vnode 不被修改（复用的是旧树 oldV——已弃树可共享）
  if (newKids == null && oldV != null && typeof oldV === 'object' && !Array.isArray(oldV)) {
    const oldKids = childrenOf(oldV as VNode)
    const newKidsAll = childrenOf(vnode)
    if (
      propsEqual((oldV as VNode).props ?? {}, vnode.props ?? {})
      && oldKids.length === newKidsAll.length
      && oldKids.every((c, idx) => c === newKidsAll[idx])
    ) {
      return oldV as VNode
    }
  }
  const v = { ...vnode } as VNode
  if (newKids) v.children = newKids
  return v
}

export function isPortal(v: unknown): v is PortalVNode {
  return v != null && typeof v === 'object' && (v as VNode).type === Portal
}

function compName(type: unknown): string {
  return typeof type === 'function' ? (type.name || 'anonymous') : String(type)
}

export { Fragment }
