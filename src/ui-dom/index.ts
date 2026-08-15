/**

 * weifuwu/ui-dom — 前端路由 + 渲染运行时（v2 vdom 引擎，render-only）
 *
 * 渲染运行时 = vdom（第 2 代引擎，design 归档）：
 * - 渲染触发唯一原语 ctx.ui.render()（无 $ / dirty——无自动渲染）
 * - 共享状态：createStore + ctx.ui.useExternal
 * - 命令式挂载：mountCommand/unmountCommand（弹窗中间件在 components 各组件内部）
 *
 * 定稿架构（design/ui-architecture.md）：req = window.location，res = VNode，
 * uiServe = VDOM（落地）；handler = 异步组件；middleware = 两阶段 async。
 */

export { h, jsx, jsxs, jsxDEV, Fragment, Portal, createPortal } from './vnode.ts'
export type { VNode, VNodeChild, Component } from './vnode.ts'
export { createClientBrowser } from './browser.ts'
export { animateOut } from './motion.ts'
export { api } from './middleware/api.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions, ApiInjected } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { AuthClient, AuthInjected } from './middleware/auth.ts'
export { ws } from './middleware/ws.ts'
export { i18n } from './i18n.ts'
export type { I18nState, I18nInjected, I18nOptions } from './i18n.ts'
export type { WsClient, WsInjected } from './middleware/ws.ts'
export type {
  WfuiContext,
} from './types.ts'

// ── 共享状态（render-only）──
export { createStore } from './store.ts'
export type { ExternalStore } from './store.ts'

// ── vdom3 精准事件流引擎（主入口一等能力——应用无需 ./vdom3 子路径） ──
export { createRoot } from './vdom3/root.ts'
export type { RootHandle } from './vdom3/root.ts'
export { createRouter } from './vdom3/router.ts'
export type { RouteDef } from './vdom3/router.ts'
export { mount, patch } from './vdom3/render.ts'
export { buildVNode, isVNode } from './vdom3/build.ts'
export { createEventStream, stream, ev, evKey } from './vdom3/events.ts'
export { replay, applyEvent, undo, eventsOf, hasEvent, expectEventSequence } from './vdom3/replay.ts'
export { NodeRegistry, ensurePortalContainer } from './vdom3/registry.ts'
export { renderToEvents, renderToEventStream, serializeEvents, deserializeEvents, eventsToHtml } from './vdom3/ssr.ts'
export { recordToTest, summarizeEvents } from './vdom3/record.ts'
export { createV3Ui } from './vdom3/ui.ts'
export { createSync, autoSync } from './vdom3/sync.ts'
export { v3Confirm, v3Toast } from './vdom3/commands.ts'
export type { V3CommandInjected } from './vdom3/commands.ts'
export { scheduler, Scheduler } from './vdom3/scheduler.ts'
export type { V3Event, Entity, Action, PatchStrategy, EventStream } from './vdom3/types.ts'
