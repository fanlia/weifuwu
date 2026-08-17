/**
 * vdom3 — vnode + stream 前端引擎（全新架构，2026-08）
 *
 * 与 vdom2 的差异：**渲染执行 = 事件流**（不是命令式 diff + 旁路记录）。
 *
 *   vdom2：状态 → renderFn → vnode 树 → diff（命令式比较）→ DOM 变更 + 旁路事件记录
 *   vdom3：状态 → renderFn → vnode 树 → **渲染事件流**（CREATE/INSERT/UPDATE/REMOVE）
 *          → 执行器消费事件 → DOM（事件流是引擎本体——DOM = fold(事件流)）
 *
 * 核心不变量：
 *   1. **vnode 树保留声明式**（renderFn 输出完整树——与 vdom2 同模型）
 *   2. **渲染即事件**：节点创建/属性设置/文本更新/插入/移除都是事件（可回放/取消/断言）
 *   3. **DOM = fold(事件流)**：初始 DOM + 事件序列 = 任意时刻 DOM（时间旅行）
 *   4. **更新最小化**：同位置同类型（含 key）复用——仅变化发事件（无整树 diff 决策噪音）
 *
 * 事件流覆盖（location → DOM）：
 *   ROUTE_CHANGE → COMP_MOUNT → NODE_CREATE/TEXT_CREATE → INSERT → PROP_UPDATE/TEXT_UPDATE
 *   → REMOVE/MOVE（更新时）→ COMP_UNMOUNT
 *
 * 与 vdom2 并行（不兼容演进）——vdom2 资产（两阶段组件/状态机/观测体系）保留，
 * vdom3 验证"事件流即执行"范式。
 */

export { h, Fragment } from './jsx.ts'
export { mount, patch } from './render.ts'
export { buildVNode, isVNode } from './build.ts'
export { createRoot } from './root.ts'
export { scheduler, Scheduler } from './scheduler.ts'
export { replay, applyEvent, undo, eventsOf, hasEvent, expectEventSequence } from './replay.ts'
export { NodeRegistry } from './registry.ts'
export { createRouter, type RouteDef } from './router.ts'
export { renderToEvents, renderToEventStream, serializeEvents, deserializeEvents, eventsToHtml } from './ssr.ts'
export { recordToTest, summarizeEvents } from './record.ts'
export { createPortal } from './jsx.ts'
export { Portal, App } from './types.ts'
export { ensurePortalContainer } from './registry.ts'
export { createV3Ui } from './ui.ts'
export { createSync, autoSync } from './sync.ts'
export { v3Confirm, v3Toast, v3Notification, type V3CommandInjected, type V3NotificationInjected, type V3NotificationOptions } from './commands.ts'
export { createEventStream, stream, nextNodeId, ev, evKey } from './events.ts'
export { registerApp, getAppFactory, resetAppRegistry } from './app.ts'
export {
  addGlobalListener, bindElementListener, bindDelegated, unbindEvent, unbindAll,
  ensureDelegationRoot, removeDelegationRoot, resetDelegation,
} from './delegate.ts'
export type { VNode, VNodeChild, V3Event, EventStream, Renderer } from './types.ts'
