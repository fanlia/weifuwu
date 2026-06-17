# Changelog

## v0.25.1 — 2026-06-17

### 规范化

- **生命周期统一**: `Queue.stop()` 从公开接口移除，统一使用 `close()`。`rateLimit` 返回类型使用命名接口 `RateLimitModule`，移除 `stop?` 遗留。
- **模块结构标准化**: `redis` 工厂函数从 `index.ts` 移入 `client.ts`，与所有目录模块的 `client.ts + index.ts barrel` 约定一致。
- **AGENTS.md 重写**: 明确文件结构、返回类型模式、`declare module` 放置位置、生命周期方法、内部/公共路由前缀的规范。
- **`__meta` 全覆盖**: 所有 11 个注入 ctx 字段的内置中间件（csrf、flash、validate、upload、requestId、s3、permissions、tenant、theme、i18n、user）添加 `__meta` 声明，`Router.use()` 在注册时自动检查缺失依赖并 `console.warn`。

### 类型安全

- **公共 `HttpError` 类**: 新增 `HttpError extends Error`（带 `status` 属性），从 `types.ts` 导出。`serve.ts` 移除私有实现。`(err as any).status` 模式从代码库中完全清除（user 模块中 6 处全部替换）。
- **`declare module` 补全**: `user/client.ts` 添加 `ctx.user: UserData` 声明，SSR/stream/test-utils 中暴露的类型不匹配一并修复。
- **`ctx: any` 消除**: `user/oauth-login.ts`、`opencode/rest.ts`、`opencode/ws.ts` 中所有路由/WS handler 改用 `Context` 类型。
- **`sql: any` 消除**: `opencode/rest.ts`、`opencode/ws.ts` 改用 `SqlClient` 类型。
- **`err: any` 消除**: `user/client.ts`、`agent/rest.ts`、`agent/run.ts`、`opencode/ws.ts` 中所有 catch 语句改用 `err: unknown` + `instanceof Error`。
- **文件级 `eslint-disable` 消除**: `opencode/session.ts`、`opencode/rest.ts`、`agent/rest.ts`、`agent/run.ts`、`user/oauth-login.ts` 转换为行级 `eslint-disable-next-line`。

### 文档

- `validate()`、`session()`、`MemoryStore`、`RedisStore` 添加完整 JSDoc（含代码示例）。

### 测试

- **`module-server` 测试**: 从 0 到 5 个测试（Router 实例检查、404 非存在文件、404 非 ts/tsx 后缀、.ts 编译、.tsx JSX 编译）。

### 变更统计

- 34 files changed, 427 insertions(+), 182 deletions(-)
- 新增 `redis/client.ts`、`test/module-server.test.ts`
- 移除 6 处 `(err as any).status`、4 处 `err: any`、4 处文件级 eslint-disable

## v0.25.0 — 2026-06-16

### 新增

- **MCP Server 集成** (`mcp.ts`) — 通过 stdio JSON-RPC 与任何 MCP Server 通信，自动将工具转换为 AI SDK `Tool` 对象。支持 `getTools()`、`refresh()`、`callTool()`、`close()`。8 个测试。
- **通知系统** (`notifier/`) — 三通道通知：inbox（DB 持久化）、email（Nodemailer）、WebSocket（hub）。用户级频道偏好，完整 CRUD。Pattern α middleware 注入 `ctx.notifier`。11 个测试。
- **API Key 管理** (`user({ apiKeys: true })`) — 每个用户可以创建/吊销 API keys，`sk_live_` 前缀 + SHA256 哈希，支持 scopes。REST API 路由 `GET/POST /api-keys`、`DELETE /api-keys/:id`。自动集成到 `middleware()` 认证流程。8 个测试。
- **WebSocket 测试工具** (`testApp().wsReq()`) — `testApp` 新增 `ws()` 和 `wsReq()` 方法，支持连接真实 WebSocket、发送/接收消息、超时断言、静默断言。6 个测试。
- **中间件依赖运行时检查** — Middleware 通过 `__meta = { injects, depends }` 声明字段依赖，`Router.use()` 在注册时 `console.warn` 提示缺失依赖。内置 `postgres`、`redis`、`session`、`aiProvider`、`rateLimit` 已附加 `__meta`。7 个测试。

### 重构

- **iii 模块简化** — 移除 `stream.ts`（411 行）及 8 个内置流函数（`stream::set/get/delete/list/list_groups/list_all/send/update`），移除 `StreamSubscription`/`StreamUpdateOp` 类型，移除 `onStream()` 方法。iii 只保留跨进程函数调用核心能力。测试从 441 行精简到 187 行，覆盖所有保留功能。

### 修复

- **postgres.js JSONB 序列化陷阱** — 通知系统的 `setPreferences()` 和 `insertNotification()` 改用 `sql.json()` 而非 `JSON.stringify()`，修复 JSONB 数组被存储为 JSON 字符串的问题。
- **MCP nextId 双重调用** — `createRequest()` 和 `sendRequest()` 各自调用 `nextId()` 导致请求 ID 不匹配，改为一处调用。

### 模块元数据

- `postgres`、`redis`、`session`、`aiProvider`、`rateLimit` 添加 `__meta` 声明

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
