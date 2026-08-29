/**
 * weifuwu/vdom — 新版本 vdom 公共面（独立实现区）
 *
 * 决策（2026-12）：
 * - ui-dom 保持不变——本目录**完全独立实现**（零引用 ui-dom——不 re-export）——
 *   完全实现后一次性替换 ui-dom
 * - 对外接口只有：h/jsx、uiServe、UIRouter
 * - createRoot **不导出**——必须使用 UIRouter（路由是唯一应用入口——
 *   类比后端 Router/serve——req = Request、res = Response）
 *
 * ── 导出面 ──
 *
 *   h / jsx / jsxs / jsxDEV
 *     JSX 运行时面——vnode 纯数据（`<div/>` 编译目标；jsx-runtime 子路径
 *     自动导入——主入口导出 h + jsx 供手写/编程式使用）
 *
 *   UIRouter
 *     应用入口——唯一创建方式：get/notFound（Trie 匹配后续——
 *     静态段 → :param → * 通配）；Handler = (req: Request, ctx) => Response
 *     ——原生 Request/Response——body = 命令流
 *
 *   uiServe
 *     渲染落地——客户端收养（初始 URL resolve → 命令流 → DOM apply）；
 *     SSR 面（同一 handler 同一 Response——body 经 commandToHtml()
 *     TransformStream 流式吐 HTML）后续实现
 *
 * 结构符号内化（X-S1 S9.4）：createPortal/Fragment/Portal 不导出——
 * createPortal 是 usePopup 内部机制；数组 = 隐式 Fragment；
 * `<></>` 经 jsx-runtime 自动导入。
 *
 * 实施进度：
 *   1. core/vnode + context/UIContext（已完成——纯数据面）
 *   2. core/commands + render（命令流——首帧同步）✓
 *   3. core/router + serve（UIRouter/uiServe——最小闭环）✓
 *   4. shared/router 核心提取（Trie + 中间件链）——待
 *   5. core/html（commandToHtml——流式 SSR）——待
 *   6. hooks/browser/middlewares 独立实现——待
 */
export { h, jsx, jsxs, jsxDEV } from './core/vnode.ts'
export { Fragment } from './core/node/fragment.ts'
export { UIRouter } from './core/router.ts'
export { createClientBrowser } from './browser/create-client-browser.ts'
// **v1 退役（2027-08）**：运行入口默认 v2（uiServe → uiServeV2 实现）——
// v1 引擎（core/serve.ts/build.ts/diff）已删除——v2 兼容桥保持外部形态
// （命令流同构——消费端零改动）
export { uiServeV2 as uiServe } from './core/v2/serve.ts'
export { uiServeV2 } from './core/v2/serve.ts'

// ── 类型面（值面仍只有 h/jsx/uiServe/UIRouter——类型不占公共面）──
// UIContext = 前端 ctx 类型（对齐后端 Context 模式——接口 + 索引签名 +
// **declare module 合并增强**（应用/中间件扩展））：
// ```ts
// declare module 'weifuwu/vdom' { interface UIContext { api: ApiClient } }
// ```
export type { UIContext, DataPipe } from './context/UIContext.ts'
export type { Component, RenderFn, VNode, VNodeChild } from './core/vnode.ts'
export type { Ui } from './hooks/env.ts'
/** 页面作者渲染入口（ctx.stream——vnode → Response 命令流） */
export type { RenderCtx } from './core/protocol.ts'
export type { Browser } from './browser/Browser.ts'
export type { ApiClient } from './middlewares/api.ts'
export type { AuthClient, I18nState } from './middlewares/auth-i18n.ts'
export type { WsClient } from './middlewares/ws.ts'
export { createStore, createSignal } from './store.ts'
// 中间件值导出（应用装配——api/auth/i18n/ws 工厂——agent-platform 等完整消费方）
export { api } from './middlewares/api.ts'
export { auth, i18n } from './middlewares/auth-i18n.ts'
export { ws } from './middlewares/ws.ts'
// 命令式 API（toast 独立函数 + injectCommands 注入——ctx.toast）
export { toast, injectCommands, type ToastType } from './commands.ts'

// ── 命令式宿主/AI 能力（组件库 dist 消费形态需要——components 构建外部化
//  '../../vdom/*' 为 weifuwu/vdom——非公共面导入也必须可解析）──
export { renderToStreamV2 as renderToStream } from './core/v2/integrate.ts' // v1 退役——v2 兼容桥
export { diffToStreamV2 as diffStream } from './core/v2/integrate.ts' // v1 退役——v2 兼容桥
export { CommandApplier } from './core/patch/index.ts'
export { createComponentRegistry } from './core/node/component.ts'
export { aiStream } from './hooks/ai-stream.ts'
export type { AiStreamHandle } from './hooks/ai-stream.ts'
export type { ExternalStore } from './store.ts'

/** 中间件类型（ui-dom 兼容——组件命令式中间件签名：confirm()/toast() 等
 *  注入 ctx 面——(ctx) => ctx' 形状） */
export type AppMiddleware<I extends object = {}, O extends object = I> = (
  ctx: import('./context/UIContext.ts').UIContext & I,
) => (import('./context/UIContext.ts').UIContext & O) | Promise<import('./context/UIContext.ts').UIContext & O>

// ── v2（VDOM-V2-BLUEPRINT——全 Observable 核心——并行演进） ──
export { renderV2 } from './core/v2/render.ts'
export { diffV2, createSegment, type SegmentMap } from './core/v2/diff.ts'
export { createRenderScheduler } from './core/v2/schedule.ts'
export { collectCommands, v2ToHtml } from './core/v2/integrate.ts'
