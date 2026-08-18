/**
 * vdom3 核心类型——vnode 契约（转发 contracts/——引擎无关）+ 渲染事件流（引擎内部）
 *
 * 架构：vnode + stream
 *   状态 → renderFn → vnode 树（声明式——组件输出完整树，与 vdom2 同模型）
 *   → 渲染器：树 → **事件流**（CREATE/INSERT/PROP_UPDATE/TEXT_UPDATE/REMOVE...）
 *   → 执行器：消费事件 → DOM
 *
 * 事件流是引擎本体：从 location 到 DOM 的每一步都是事件——可记录/回放/取消/断言。
 * 不变量：DOM = fold(事件流)——给定初始 DOM + 事件流 = 任意时刻 DOM。
 *
 * （vdom4 端口化 UI-1：vnode/组件/ctx 契约移入 contracts/——引擎无关——
 *  本文件保留事件流与渲染器接口（引擎内部——vdom4 P0 命令化后演进））
 */

// ── vnode/组件/ctx 契约（contracts/——引擎无关——v5 不动） ──
export { Fragment, Portal, App, classifyKind, childrenOf } from '../contracts/vnode.ts'
export type {
  VNode, VNodeChild, FlatChild, Component, VKind, PortalVNode, AppVNode,
} from '../contracts/vnode.ts'
export type { V3Ctx, V3Ui } from '../contracts/ctx.ts'
import type { VNode, VNodeChild } from '../contracts/vnode.ts'

// ── 渲染事件流（location→DOM 全链路——引擎本体） ──
//
// 统一命名：对象 + 动作 + 参数（entity + action + target + payload）——
// 每一层（location/jsx/vdom/dom）同构：
//   location 层：{ entity:'route', action:'change' }         —— 路由变更
//   jsx 层    ：{ entity:'comp'/'props', action:'render'/'mount'/'unmount'/'build'/'update' }
//   vdom 层   ：{ entity:'vnode', action:'patch' }           —— diff 决策（strategy 参数）
//   dom 层    ：{ entity:'node'/'text'/'prop'/'event'/'ref', action:'create'/'insert'/'remove'/'move'/'update'/'bind'/'unbind'/'cleanup' }
//
// 不变量：任何事件触发，最终都落到 dom 层事件（node/text/prop/event/ref 的精准状态变化）——
// 决策层事件（route/comp/vnode）只是解释"为什么"，执行层事件（dom）是"做了什么"。

export type Entity = 'route' | 'comp' | 'props' | 'vnode' | 'node' | 'text' | 'prop' | 'event' | 'ref' | 'error' | 'internal' | 'stream' | 'effect' | 'app' | 'diff' | 'render' | 'portal'

export type Action =
  /** location 层 */
  | 'change'
  /** jsx 层 */
  | 'render' | 'build' | 'mount' | 'unmount' | 'update'
  /** vdom 层 */
  | 'patch'
  /** dom 层 */
  | 'create' | 'insert' | 'remove' | 'move' | 'bind' | 'unbind' | 'cleanup'
  /** 错误层（任意环节失败——事件流完整覆盖：throw=未捕获传播 / caught=隔离降级） */
  | 'throw' | 'caught'
  /** 内部决策层（渲染管线内部状态——busy 排队/组件未定位/跳过——非正常路径可观测） */
  | 'queue' | 'notfound' | 'skip'
  /** 事件流自身层（buffer 状态——溢出覆盖/水位预警可观测） */
  | 'overflow' | 'watermark'
  /** diff 决策层（阶段 0——vdom2 机制事件化）：
   *  transition = 类型转换决策（from 旧 kind → to 新 kind——patch 查表分派观测）
   *  mode       = key 模式选择（unkeyed/keyed/mixed——业务身份声明协议观测）
   *  summary    = children 摘要（old/new/dom 三序列——顺序错乱快速定位） */
  | 'transition' | 'mode' | 'summary'
  /** 渲染性能层（round2 阶段 2——每次渲染耗时可观测） */
  | 'duration'
  /** 调度时间线层（round3 阶段 2——渲染排队/合并可观测） */
  | 'queued' | 'flushed'
  /** portal 生命周期层（round3 阶段 3——弹层开合可观测） */
  | 'open' | 'close'
  /** 组件副作用层（ref 挂载/动画/滚动锁/焦点 trap/滚动——非渲染的 DOM 行为可观测） */
  | 'mount' | 'animate' | 'lock' | 'unlock' | 'focus' | 'scroll'
  /** 用户文本操作层（输入/选区/剪贴板——用户对文本的交互可观测） */
  | 'input' | 'select' | 'copy' | 'cut' | 'paste'
  /** 应用编排层（app 节点——子应用挂载/更新/卸载/错误——payload.appId 可区分） */
  | 'mount' | 'unmount' | 'error'

export type V3Event = {
  /** 对象（什么） */
  entity: Entity
  /** 动作（怎么了） */
  action: Action
  /** 对象 id（目标定位——node id / comp id） */
  target?: string
  /** 参数（对象相关数据——旧值/新值/父节点/属性 key 等） */
  payload?: Record<string, unknown>
  /** 渲染会话 id（一次渲染（renderByIds/首帧/导航）内的事件共享同一 session——
   *  按会话过滤/回放——vdom2 traceId 事件流化）——emit 时注入（stream 持有当前会话） */
  session?: string
  ts: number
}

/** patch 决策策略（vnode:patch 的 payload.strategy） */
export type PatchStrategy = 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'

/** 错误发生的环节（error:throw/caught 的 payload.phase——全链路可定位） */
export type ErrorPhase = 'factory' | 'renderFn' | 'build' | 'patch' | 'mount' | 'update' | 'hook' | 'schedule' | 'event'

/** 事件流（记录/回放/断言——DOM = fold(events)） */
export interface EventStream {
  emit(ev: V3Event): void
  /** 新渲染会话开始（每次渲染入口调用——同一次渲染的事件共享 session） */
  setSession(): string
  /** 当前会话 id（无渲染进行时 null） */
  currentSession(): string | null
  /** 实时订阅（emit 同步回调——缓冲溢出也不丢事件——返回退订）
   *  重载：subscribe(fn) 全部事件；subscribe(filter, fn) 按层过滤（entity） */
  subscribe(fn: (ev: V3Event) => void): () => void
  subscribe(filter: Entity[] | Entity, fn: (ev: V3Event) => void): () => void
  events(): V3Event[]
  /** 按渲染会话过滤（一次渲染的事件全量——调试/回放按会话） */
  eventsBySession(sessionId: string): V3Event[]
  /** 当前有效条数（缓冲占用——事件流自身状态可观测） */
  size(): number
  /** 缓冲容量 */
  capacity(): number
  /** 溢出次数（最旧事件被覆盖的次数——事件丢失可审计） */
  overflowCount(): number
  /** 逆操作（取消——INSERT↔REMOVE / UPDATE 恢复旧值） */
  inverse(ev: V3Event): V3Event | null
  reset(): void
}

// ── 渲染器 ──

export interface Renderer {
  /** 挂载（vnode → 事件流 → DOM） */
  mount(vnode: VNode, root: HTMLElement): void
  /** 更新（旧树 vs 新树 → 事件流 → DOM——同位置同类型复用，仅变化发事件） */
  patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): void
}
