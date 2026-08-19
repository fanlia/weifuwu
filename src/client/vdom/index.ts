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
export { UIRouter } from './core/router.ts'
export { uiServe } from './core/serve.ts'

// ── 类型面（值面仍只有 h/jsx/uiServe/UIRouter——类型不占公共面）──
// UIContext = 前端 ctx 类型（对齐后端 Context 模式——接口 + 索引签名 +
// **declare module 合并增强**（应用/中间件扩展））：
// ```ts
// declare module 'weifuwu/vdom' { interface UIContext { api: ApiClient } }
// ```
export type { UIContext, DataPipe } from './context/UIContext.ts'
export type { Component, RenderFn, VNode, VNodeChild } from './core/vnode.ts'
export type { Ui } from './hooks/env.ts'
export type { Browser } from './browser/Browser.ts'
export type { ApiClient } from './middlewares/api.ts'
export type { AuthClient, I18nState } from './middlewares/auth-i18n.ts'
export type { WsClient } from './middlewares/ws.ts'
export type { ExternalStore } from './store.ts'
