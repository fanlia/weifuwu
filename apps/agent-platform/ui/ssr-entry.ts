/**
 * agent-platform SSR 入口（ssr-entry.ts——服务端 uiSsr 渲染专用 bundle）
 *
 * **同一模块实例纪律（showcase 2026-08 实证教训）**：h()/renderToStream/
 * uiSsr 必须来自同一个 vdom 模块实例——若服务端用原始 src 的 uiSsr
 * 消费 bundle 内 h() 创建的 VNode——Fragment 符号是两份拷贝
 * （Symbol 全等性断裂）→ "非法子节点 type: symbol" → 文本变空洞锚。
 * 本入口把 uiSsr + router 一起打进 bundle——VNode 生产/消费同实例。
 *
 * 本 bundle 被 server.ts 的 loadSsrApp() 编译加载（esbuild → 临时 mjs →
 * file:// import——showcase 根治模式：无 data url 竞态/长度面）。
 */
export { uiSsrV2 as uiSsr } from '../../../src/client/vdom/core/v2/ssr.ts' // v1 退役——SSR 运行路径 v2
export { router } from './router.ts'
