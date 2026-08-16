/**
 * vdom3 build — 异步组件构建（两阶段组件 → 纯 vnode 树）
 *
 * 与 vdom2 同模型：先 await 组件工厂 + renderFn → 构建产物（纯树）→ 同步渲染。
 * 组件实例复用：同位置同类型（patch 判定）→ 工厂不重跑（内部状态保持）。
 */

import type { VNode, VNodeChild, Component, PortalVNode, V3Ctx } from './types.ts'
import { Fragment, Portal, childrenOf } from './types.ts'
import { stream, ev, nextNodeId } from './events.ts'
import { createClientBrowser } from '../browser.ts'
import { indexComponent } from './comp-index.ts'
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
  if (typeof vnode.type === 'function') {
    // 克隆（组件实例字段 _render/_id/_child 写克隆——旧树保持完整）
    const v = { ...vnode } as VNode
    const reuse = oldV != null && typeof oldV === 'object' && oldV.type === vnode.type && oldV.key === vnode.key && oldV._render
      ? oldV
      : null
    if (reuse) {
      v._render = reuse._render
      v._id = reuse._id
      indexComponent(v)
      // BUILD 事件：组件构建决策（工厂复用——内部状态保持的事件证据）；
      // index: true——组件实例进入 O(1) 定位表（comp-index 注册——状态可观测）
      stream.emit(ev('comp', 'build', v._id!, { name: compName(v.type), reused: true, index: true }))
      // props 级 diff（剪枝）：新旧 props 浅比较——不变 → 复用旧输出（不重跑 renderFn——
      // 零 RENDER——父重渲染不波及 props 未变的子组件）；根组件不剪枝（isRoot——
      // 内部状态变化必须重跑 renderFn）
      if (!isRoot && propsEqual(reuse.props, v.props)) {
        v._child = reuse._child
        return v
      }
      // props 变化 → 驱动重渲染（PROPS_UPDATE 事件——变化的 key 可观测）
      const changedKeys = Object.keys({ ...reuse.props, ...v.props }).filter((k) => reuse.props[k] !== v.props[k])
      stream.emit(ev('props', 'update', v._id!, { name: compName(v.type), keys: changedKeys }))
    } else {
      v._id = nextNodeId()
      indexComponent(v)
      stream.emit(ev('comp', 'build', v._id, { name: compName(v.type), reused: false, index: true }))
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
