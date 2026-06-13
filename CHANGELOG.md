# Changelog

## v0.23.0 — 2026-06-13

### SSR 架构重构

- **运行时 esbuild 消除** — `buildClientBundle()` 替换为预编译 `compileBrowser()` + inline `<script type="module">`
- **统一 store** — 所有模块共享 `globalThis.__WEIFUWU_CTX_STORE`，消除之前 vendor bundle、页面组件、`_sc` IIFE 三个独立 store 导致的数据不同步问题
- **消除 3 个全局变量** — `__WEIFUWU_PROPS`、`__LOCALE_DATA__`、`__WFW_ENTRY` 全部移除，统一走 `setCtx()`
- **翻译自动重建** — `addCtxRebuilder` 机制，`setCtx()` 时自动从 `messages` 重建 `t()` 函数
- **脚本在 `</body>` 前** — 修复之前脚本在 `</html>` 之后被浏览器忽略的问题
- **生产模式可用** — importmap + vendor bundle 路由始终注入，生产模式下 `hydrateRoot` 正常水合
- **vendor bundle content hash** — URL 带 `?h=<hash>`，内容变化时自动失效
- **编译跳过** — 生产环境下 `compileBrowser` 检测文件已存在时跳过 esbuild
- **vendor bundle 从源码编译** — 不再依赖 `dist/react.js`，修改源码后无需手动 `npm run build`

### 模块重构

- **AI Provider 核心模块** — `aiProvider()` 统一模型/嵌入/配置抽象
- **OAuth 合并到 User** — `user({ oauthLogin: { providers } })`
- **Permissions 模块** — RBAC：`requireRole()`、`requirePermission()`
- **Cron 合并到 Queue** — `queue.cron(pattern, handler)`，三种后端
- **Preferences 拆分** — `theme.ts` + `i18n.ts` + `flash.ts`，移除 `ctx.prefs`
- **每个中间件一个 ctx 字段** — `ctx.theme`、`ctx.i18n`、`ctx.flash`，移除 `ctx.sessionId`

### 修复

- `detectLocale` 验证 Accept-Language 有效性（Node.js fetch 默认发送 `Accept-Language: *`）
- `client-locale` 切换语言第一次无效
- `session` 移除冗余的 `ctx.sessionId`
- dev 模板 SIGINT 明确退出
- i18n 中间件顺序调整
- queue 测试超时修复
- 多个 SSR 实例路径跟随挂载前缀

### 依赖

- 新增: `chokidar` (dev), `esbuild` (dev)
- 要求: Node.js ≥24
