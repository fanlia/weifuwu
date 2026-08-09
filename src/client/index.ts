/**
 * weifuwu/client — VDOM 前端框架
 *
 * 概念：
 *   组件 = (props, ctx) => VNode
 *   状态 = JS 变量
 *   更新 = ctx.ui.render()
 *   挂载/卸载 = ref 回调
 *
 * 导出：
 *   h / jsx / jsxs / jsxDEV / Fragment  → JSX 工厂
 *   createApp                            → 应用引导
 *   router / RouteView                   → 路由
 *   api / auth / ws                      → 中间件
 *   extendCtx                            → ctx 扩展
 *   WfuiContext / AppMiddleware / RouteDef → 类型
 */

export { h, jsx, jsxs, jsxDEV, Fragment, Portal, createPortal } from './vnode.ts'
export type { VNode, VNodeType, Component, AsyncComponent } from './vnode.ts'
export { asyncComponent, isAsyncComponent } from './vnode.ts'

export { createApp } from './app.ts'
export type { App } from './app.ts'

export { router, RouteView } from './router.ts'
export type { RouteInjected } from './router.ts'

export { ws } from './middleware/ws.ts'
export type { WsClient, WsInjected } from './middleware/ws.ts'
export { api } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions, ApiInjected } from './middleware/api.ts'
export { ApiError } from './middleware/api.ts'
export type { AuthClient, AuthOptions, AuthInjected } from './middleware/auth.ts'

export { extendCtx } from './types.ts'
export type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'

export { aiStream } from './ai.ts'
export type { AiStreamCallbacks, AiStreamOptions, AiStreamHandle } from './ai.ts'
export { toChatMessages } from './use-chat.ts'
export type { UiMessage, UiToolCall, UseChatOptions, UseChatState, UseChatHandle, ChatApi } from './use-chat.ts'
export type {
  WfStreamEvent,
  WfMessageStart,
  WfToken,
  WfUsage,
  WfDone,
  WfError,
  WfErrorCode,
  WfToolCall,
  WfToolResult,
  WfToolProgress,
  WfStep,
  WfApprovalRequest,
  WfApprovalResponse,
  WfApprovalDecision,
  ChatMessage,
  ChatParams,
  MessageRole,
  ToolCall,
  ToolDefinition,
} from '../ai/types.ts'

export { ErrorBoundary } from './error-boundary.ts'
export type { ErrorBoundaryProps } from './error-boundary.ts'

export { i18n } from './i18n.ts'
export type { I18nOptions, I18nState, I18nInjected } from './i18n.ts'

export { createReactiveState } from './reactive.ts'
export type { ReactiveState } from './types.ts'
export { lockScroll, unlockScroll } from './scroll-lock.ts'
export { trapFocus } from './focus-trap.ts'

// 渲染/动效内部机制（components bundle 外部化后共享同一模块实例，防 idRegistry 等状态重复）
// ⚠️ 内部 API（非公共契约）：供 components bundle 与 SSR/dev 工具使用；
//    应用层如需命令式挂载请走 ctx.ui 或 createApp。
export { mountVNode, callRefCleanup, clearAsyncComponentCache } from './render.ts'
export { hydrateVNode } from './hydration.ts'
export { patchValue } from './diff.ts'
export { animateOut } from './motion.ts'

export { computeFixedPos, computeFixedPosRect } from './popup.ts'
export type { FixedPos, Placement } from './popup.ts'

export { zhCN } from './locale/zh_CN.ts'
export { enUS } from './locale/en_US.ts'
