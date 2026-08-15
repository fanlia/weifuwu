/**
 * vdom3 核心类型——状态 / 事件 / 指令契约
 */

// ── 状态原语（细粒度响应式） ──

export interface Signal<T> {
  /** 读当前值（绑定追踪——effect 内读取自动订阅） */
  (): T
  /** 写新值（触发调度——值相同不触发） */
  set(value: T): void
  /** 基于当前值更新 */
  update(fn: (prev: T) => T): void
  /** 订阅变化（返回退订） */
  subscribe(cb: (value: T, prev: T) => void): () => void
  /** 当前值（渲染/绑定读取——不追踪） */
  value: T
}

// ── 事件流（引擎本体——location→DOM 全链路） ──

export type V3Event =
  | { type: 'ROUTE_CHANGE'; path: string; params: Record<string, string>; ts: number }
  | { type: 'COMP_MOUNT'; id: string; name: string; ts: number }
  | { type: 'COMP_UNMOUNT'; id: string; name: string; ts: number }
  | { type: 'SIGNAL_SET'; signal: string; value: unknown; prev: unknown; ts: number }
  | { type: 'DOM_INSERT'; parent: string; node: string; ref?: string | null; ts: number }
  | { type: 'DOM_REMOVE'; parent: string; node: string; ts: number }
  | { type: 'DOM_UPDATE'; target: string; key: string; value: unknown; prev: unknown; ts: number }
  | { type: 'DOM_MOVE'; node: string; parent: string; ref: string | null; ts: number }
  | { type: 'EFFECT_RUN'; id: string; ts: number }

/** 事件流记录（可回放/取消——DOM = fold(events)） */
export interface EventStream {
  /** 记录事件（引擎内部——每个状态变化/DOM 指令都进流） */
  emit(ev: V3Event): void
  /** 全部事件（回放/断言） */
  events(): V3Event[]
  /** 逆操作（DOM 层取消——INSERT↔REMOVE、UPDATE 恢复旧值） */
  inverse(ev: V3Event): V3Event | null
  /** 回放到指定事件数（DOM 恢复——需要初始快照配合） */
  reset(): void
}

// ── DOM 指令（执行器消费——可逆） ──

export type DomInstr =
  | { op: 'INSERT'; parent: Node; node: Node; ref?: Node | null }
  | { op: 'REMOVE'; parent: Node; node: Node }
  | { op: 'UPDATE'; target: Element; key: string; value: unknown; prev: unknown }
  | { op: 'MOVE'; node: Node; parent: Node; ref: Node | null }

// ── 渲染器 ──

export interface Renderer {
  /** 挂载根组件（初始事件流起点） */
  mount(view: () => V3Node, root: HTMLElement): void
  /** 批处理调度（同 tick 内 signal 变化合并——防指令风暴） */
  flush(): void
}

// ── 视图节点（vdom3 无整树 diff——节点是"状态绑定点"） ──

export type V3Node =
  | string
  | number
  | ElementNode
  | TextBind
  | StructNode
  | V3Node[]

export interface ElementNode {
  kind: 'element'
  tag: string
  props?: Record<string, unknown>
  children?: V3Node[]
  /** 元素引用（渲染后回填） */
  el?: Element
}

/** 文本绑定点：`() => count()`——signal 变化只更新此文本 */
export interface TextBind {
  kind: 'text-bind'
  fn: () => unknown
  /** 渲染后回填（指令目标定位） */
  el?: Text
}

/** 结构节点：条件（Show）/ 列表（For）——局部插入/移除指令 */
export interface StructNode {
  kind: 'struct'
  type: 'show' | 'for'
  when?: () => unknown
  each?: () => unknown[]
  key?: (item: unknown) => string
  /** 渲染内容函数（show：单值；for：项） */
  render?: (...args: any[]) => V3Node | null | undefined | boolean
  /** 容器引用 */
  el?: Node
}
