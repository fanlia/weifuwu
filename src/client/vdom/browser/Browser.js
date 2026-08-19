/**
 * vdom browser — 浏览器环境接口（依赖注入——uiServe 显式接收）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——**无全局依赖**——
 * 注入 window/document 两字段为基座 + **组件消费面方法**（AGENTS §5.5——
 * 组件禁止直接访问 DOM 全局——一律经 ctx.browser 唯一入口——46 处迁移
 * 基线）。接口按组件库消费面扩展（P2 组件迁移——activeElement/byId/
 * copyText/scrollTop/storage 等）。
 *
 * 三态实现：客户端 createClientBrowser（惰性 typeof 防御）· SSR shim
 * （null/0/false/no-op——组件 SSR 安全）· 测试 testBrowser()/jsdom。
 */
export {};
