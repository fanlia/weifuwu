/**
 * vdom3 核心类型——vnode 树（声明式）+ 渲染事件流（执行层）
 *
 * 架构：vnode + stream
 *   状态 → renderFn → vnode 树（声明式——组件输出完整树，与 vdom2 同模型）
 *   → 渲染器：树 → **事件流**（CREATE/INSERT/PROP_UPDATE/TEXT_UPDATE/REMOVE...）
 *   → 执行器：消费事件 → DOM
 *
 * 事件流是引擎本体：从 location 到 DOM 的每一步都是事件——可记录/回放/取消/断言。
 * 不变量：DOM = fold(事件流)——给定初始 DOM + 事件流 = 任意时刻 DOM。
 */

// ── vnode 树（声明式——与 vdom2 同模型） ──

/** 两阶段组件契约（与 vdom2 同模型：mount 工厂一次 + renderFn 每次渲染） */
export type Component<P = Record<string, unknown>, C = Record<string, unknown>> = (
  initProps: P,
  ctx: C,
) => Promise<(props: P) => Promise<VNode | null>>

export interface VNode {
  /** native 标签名 / 组件函数 / Fragment 符号 */
  type: string | symbol | Component
  props: Record<string, unknown>
  key?: string | null
  /** 渲染后回填：DOM 元素（native）/ 组件实例输出（comp） */
  el?: Node | null
  children?: VNodeChild[]
  /** 组件实例状态（comp：工厂返回的 renderFn + 实例 id） */
  _render?: (props: any) => Promise<VNode | null>
  _id?: string
}

export type VNodeChild = VNode | string | number | null | undefined | boolean

export const Fragment: unique symbol = Symbol('v3-fragment')

// ── 渲染事件流（location→DOM 全链路——引擎本体） ──

export type V3Event =
  /** 路由 */
  | { type: 'ROUTE_CHANGE'; path: string; params: Record<string, string>; ts: number }
  /** 组件 */
  | { type: 'COMP_MOUNT'; id: string; name: string; ts: number }
  | { type: 'COMP_UNMOUNT'; id: string; name: string; ts: number }
  /** 渲染指令（DOM 变更——执行器消费；可逆） */
  | { type: 'NODE_CREATE'; id: string; tag: string; ts: number }
  | { type: 'TEXT_CREATE'; id: string; value: string; ts: number }
  | { type: 'INSERT'; parent: string; child: string; ref?: string | null; ts: number }
  | { type: 'REMOVE'; parent: string; child: string; ts: number }
  | { type: 'PROP_UPDATE'; target: string; key: string; value: unknown; prev: unknown; ts: number }
  | { type: 'TEXT_UPDATE'; target: string; value: string; prev: string; ts: number }
  | { type: 'MOVE'; node: string; parent: string; ref: string | null; ts: number }

/** 事件流（记录/回放/断言——DOM = fold(events)） */
export interface EventStream {
  emit(ev: V3Event): void
  events(): V3Event[]
  /** 逆操作（取消——INSERT↔REMOVE / UPDATE 恢复旧值） */
  inverse(ev: V3Event): V3Event | null
  reset(): void
}

// ── 渲染器 ──

export interface Renderer {
  /** 挂载（vnode → 事件流 → DOM） */
  mount(vnode: VNode, root: HTMLElement): void
  /** 更新（旧树 vs 新树 → 事件流 → DOM——同位置同类型复用，仅变更发事件） */
  patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): void
}
