# Changelog

## v0.24.0 — 2026-06-14

### 认证体系统一

- **`auth.ts` 移除** — 统一使用 `user()`，所有策略（静态 token、自定义 verify、proxy 代理验证、session 验证）全部集成在 `user().middleware()` 中
- **`user()` 支持无 DB 模式** — `pg` 和 `jwtSecret` 改为可选，不传则只启用无数据库的认证策略

### 模块模式规范

- **`theme()` / `i18n()` 拆分** — 从 α 自路由中间件拆分为 β Router + `.middleware()`，模式与 `analytics()` 一致
- **Router 自动注册** — `app.use(theme())` 自动注册中间件 + 挂载路由，一行即可
- **生命周期统一** — 所有有状态模块使用 `.close()`（`rateLimit.stop()` → `.close()`，`iii.shutdown()` → `.close()`）

### 类型系统强化

- **`declare module` 全覆盖** — 所有 16 个 ctx 注入模块使用模块增强，无论链式还是独立 `use()` 调用都有类型
- **`ctx.csrfToken` → `ctx.csrf.token`** — 命名空间化
- **`trace()` 中间件** — `ctx.trace = { requestId, traceId, elapsed, startTime }`，统一追踪入口，`requestId()` 标记 `@deprecated`
- **`env()` 中间件** — `ctx.env` 自动注入 `WEIFUWU_PUBLIC_*` 环境变量
- **`aiProvider()` 实现为 Middleware** — `app.use(aiProvider())` → `ctx.ai`，同时保留独立使用

### 新增

- `MIGRATION.md` — 0.22 → 0.24 完整迁移指南
- `user().middlewareOptional()` — 非阻塞的认证中间件
- `user({ resolveUser })` — session 用户解析
- `env()` / `getPublicEnv()` — 公共环境变量中间件
- `trace()` — 集成 requestId + traceId + elapsed 的追踪中间件

### 破坏性变更

| 变更                 | 迁移                                              |
| -------------------- | ------------------------------------------------- |
| `auth()` 移除        | 改用 `user({ tokens/verify/proxy }).middleware()` |
| `ctx.csrfToken`      | 改为 `ctx.csrf.token`                             |
| `rateLimit().stop()` | 改为 `.close()`（旧名仍可用）                     |
| `iii.shutdown()`     | 改为 `.close()`（旧名仍可用）                     |
| `requestId()`        | 推荐改 `trace()`（旧模块仍可用，`@deprecated`）   |

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
