/**
 * vdom3 — 状态驱动前端引擎（全新架构）
 *
 * 无整树 diff：状态（signal）→ 绑定点更新 / 结构指令（Show/For）→ DOM 指令 → DOM。
 * 事件流是引擎本体：location→DOM 全链路可记录/回放/取消（DOM = fold(事件流)）。
 */

export { signal, computed, effect, track } from './signal.ts'
export { h, bind, Show, For } from './jsx.ts'
export { renderNode } from './render.ts'
export { stream } from './events.ts'
export type { Signal, V3Node, EventStream, V3Event } from './types.ts'
