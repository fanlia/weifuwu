/**
 * vdom core2 — event（事件——CRUD 四原语——统一类型）
 *
 * 原语（与节点类型正交——载荷携带类型信息——数组/组件无 DOM 实体——
 * 生成端展开为子节点事件）：
 *   create  —— 创建节点（**原子：创建 + 挂载**——payload 三态：
 *              text/hole/element——attrs 与 vnode2dom 同归一）
 *   read    —— 读取节点（查询面——diff 对照的基础——无 DOM 副作用——
 *              事件流中可含（语义完整）——可逆 = 自身）
 *   update  —— 更新节点（文本 / 属性整体替换 / 位置移动）
 *   delete  —— 删除节点（前缀级联——区间语义由 id 前缀保证——A1 id 规则）
 *
 * 可逆性契约（A4）：每个事件携带 reverse——create 的逆 = delete；
 * delete 的逆 = create（快照在事件流——生成端重建）；update 的逆 =
 * 旧值（patch 携带 prev）；read 的逆 = 自身——"事件流 + 当前节点 →
 * 原节点"：reverse 流逆序应用。
 *
 * 流控制：无 done——流结束即 EOF——整树清理由 delete 显式（done.full
 * 语义取消——确定性显式化）。
 */

/** 节点载荷（create 原语——DOM 实体三态——attrs 归一规则同 vnode2dom） */
export type NodePayload =
  | { kind: 'text'; value: string }
  | { kind: 'hole'; value: null | boolean | 'start' | 'split' | 'end' | 'invalid' }
  | { kind: 'element'; tag: string; attrs: Record<string, unknown> }

/** 更新补丁（update 原语——文本/属性/位置——属性整体替换（style 纪律）） */
export type UpdatePatch =
  | { text: string }
  | { attrs: Record<string, unknown> }
  | { move: { parent: string; ref: string | null } }

/** 事件（CRUD 四原语——判别联合——可序列化——NDJSON 传输面） */
export type Event =
  | { op: 'create'; id: string; payload: NodePayload; parent: string; ref: string | null }
  | { op: 'read'; id: string }
  | { op: 'update'; id: string; patch: UpdatePatch }
  | { op: 'delete'; id: string }

/** 可逆事件（转换/渲染的事件流元素——apply + reverse 对） */
export interface ReversibleEvent {
  /** 正向事件（x → y） */
  apply: Event
  /** 逆向事件（y → x——单条——组合逆序由应用器负责） */
  reverse: Event
}

/** 反向恢复：reverse 流逆序应用（f(E, yDom) = xDom） */
export function reverseStream(events: ReversibleEvent[]): Event[] {
  return events.map((e) => e.reverse).reverse()
}
