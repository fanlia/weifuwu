/**
 * showcase SSR 入口（ssr.ts——服务端 uiSsr 渲染专用 bundle）
 *
 * **同一模块实例纪律（2026-08——非法子节点 type: symbol 实证）**：h()/
 * renderToStream/uiSsr 必须来自同一个 vdom 模块实例——若服务端用
 * 原始 src 的 uiSsr 消费 bundle 内 h() 创建的 VNode——Fragment 符号
 * 是两份拷贝（Symbol('fragment') 全等性断裂）→ 构建端报"非法子节点
 * ——object（type: symbol）"→ 文本全部变空洞锚。本入口把 uiSsr 一起
 * 打进 bundle——VNode 生产/消费同实例——零漂移。
 */
export { uiSsrV2 as uiSsr } from '../../../src/client/vdom/core/v2/ssr.ts' // v1 退役——SSR 运行路径 v2（v1 uiSsr 仅对账基线——v2-ssr 契约引用）
export { buildRouter } from './app-router.ts'
export { fetchIndex, getIndexCache } from './data.ts'
