# weifuwu v0.20 优化计划

## 总目标

**从「什么都有」收敛为「AI Agent 后端平台」。** 砍拓展、深核心、补短板。不改 API 契约，只做增量优化 + 内部重构。

---

## 一、类型安全：ctx 链式推导 ⭐⭐⭐ 最高优先级

### 问题

当前 `Context` 是 `[key: string]: unknown`，所有中间件注入的属性丢失类型：

```ts
// 现状：全是 unknown
app.get('/me', auth.middleware(), (req, ctx) => {
  ctx.user // unknown
  ctx.sql // unknown
})
```

### 方案

引入泛型链式 Context，参考 tRPC 的 middleware 类型叠加：

```ts
// 新的类型定义（types.ts 改动）

// 基础 Context
export interface BaseContext {
  params: Record<string, string>
  query: Record<string, string>
  mountPath?: string
}

// 扩展型 Context = 基础 + 中间件注入的属性
export type Context<T = {}> = BaseContext & T

// Handler 接受泛型 Context
export type Handler<T = {}> = (req: Request, ctx: Context<T>) => Response | Promise<Response>

// Middleware 叠加：输入 CtxIn，输出 CtxIn & { 注入的属性 }
export type Middleware<CtxIn = {}, CtxOut extends CtxIn = CtxIn> = (
  req: Request,
  ctx: Context<CtxIn>,
  next: Handler<CtxOut>,
) => Response | Promise<Response>
```

### 各模块改动

| 模块                    | 注入属性                | 新类型                                         |
| ----------------------- | ----------------------- | ---------------------------------------------- |
| `postgres()`            | `sql`                   | `{ sql: Sql<{}> }`                             |
| `redis()`               | `redis`                 | `{ redis: Redis }`                             |
| `user().middleware()`   | `user`                  | `{ user: UserData }`                           |
| `preferences()`         | `prefs`, `t`, `setPref` | `{ prefs: Record<string,string>, t, setPref }` |
| `csrf()`                | `csrfToken`             | `{ csrfToken: string }`                        |
| `requestId()`           | `requestId`             | `{ requestId: string }`                        |
| `queue()`               | `queue`                 | `{ queue: Queue }`                             |
| `deploy()`              | `deploy`                | `{ deploy: { appName? } }`                     |
| `tenant().middleware()` | `tenant`                | `{ tenant: TenantContext }`                    |
| `validate()`            | `parsed`                | `{ parsed: ParsedData }`                       |
| `upload()`              | `parsed`                | `{ parsed: { files, fields } }`                |

### Router 泛型化

```ts
// Router<Ctx> 记录全局 middleware 链累积的类型
class Router<Ctx = {}> {
  use<CtxOut extends Ctx>(mw: Middleware<Ctx, CtxOut>): Router<CtxOut>
  use<CtxOut extends Ctx>(path: string, mw: Middleware<Ctx, CtxOut>): Router<CtxOut>
  get(path: string, ...mws: Middleware<Ctx, any>[], handler: Handler<any>): Router<Ctx>
  post(path: string, ...mws: Middleware<Ctx, any>[], handler: Handler<any>): Router<Ctx>
  handler(): Handler<Ctx>
}
```

### 向后兼容

- `Handler` 默认 `Handler<{}>` = 旧行为
- `Middleware` 默认 `Middleware<{}, {}>` = 旧行为
- 不传泛型的代码零改动

### 工作量估计：3-5 天

✅ **已完成** — 2024 年 6 月

- `types.ts` 泛型化，保留 `Context` 为 interface（兼容模块 augmentation）
- `router.ts` 泛型化 `Router<T extends Context>`，链式 `use()` 累加类型
- 10 个模块添加精确返回类型：`postgres`、`redis`、`queue`、`user`、`csrf`、`requestId`、`preferences`
- 645 个测试全通过，零破坏性变更
- 新增导出：`PostgresInjected`、`RedisInjected`、`QueueInjected`、`UserInjected`

**使用示例**：

```ts
const app = new Router()
  .use(csrf()) // → Router<Context & { csrfToken: string }>
  .use(requestId()) // → Router<Context & { csrfToken, requestId }>
  .use(postgres()) // → Router<Context & { csrfToken, requestId, sql }>

app.get('/me', (req, ctx) => {
  ctx.csrfToken // ✅ string
  ctx.requestId // ✅ string
  ctx.sql`SELECT 1` // ✅ Sql<{}>
})
```

### 工作量估计：3-5 天

---

## 二、可观测性：Request Tracing + 结构化日志 ⭐⭐⭐

### 问题

- 没有 `traceId`，跨模块调用无法关联
- `logger()` 只是 `console.log` 格式，不可查询
- agent/opencode 运行错误只能靠 `console.error` 排查
- 没有任何方式看到「这个请求经过了多少中间件、花了多少时间」

### 方案

#### 2.1 Request Tracing

在 `serve()` 入口注入 trace context：

```ts
// serve.ts — 每个请求自动附加

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

const traceAls = new AsyncLocalStorage<{ traceId: string; startTime: number }>()

// 暴露给 logger / 其他模块用
export function currentTraceId(): string | undefined {
  return traceAls.getStore()?.traceId
}

// serve() 内：
const traceId = (req.headers['x-trace-id'] as string) || randomUUID()
const startTime = Date.now()
await traceAls.run({ traceId, startTime }, async () => {
  // ... handle request
  const elapsed = Date.now() - startTime
  // 自动记录 trace
})

// 响应头自动附加
headers.set('X-Trace-Id', traceId)
```

#### 2.2 logger 重构

```ts
// logger.ts — 从「打印格式」变为「记录事件」

interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  traceId?: string
  method?: string
  path?: string
  status?: number
  elapsed?: number // ms
  metadata?: Record<string, unknown>
}

export interface LoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error'
  // 输出目标。不传 = stderr JSON
  sink?: (event: LogEvent) => void
}

// 中间件行为：请求进入/离开各记一条
// [info] request start  GET /api/users  traceId=xxx
// [info] request end    GET /api/users  200  42ms  traceId=xxx
```

#### 2.3 关键模块接入 trace

| 模块          | 接入方式                                        |
| ------------- | ----------------------------------------------- |
| `postgres`    | 慢查询（>100ms）自动记 warn + traceId           |
| `agent.run()` | 每次调用记 info（agentId, input 摘要, traceId） |
| `opencode`    | 每次 session message 记 traceId                 |
| `messager`    | agent 路由调用记 traceId                        |

### 向后兼容

- `logger()` 默认 `'short'` 格式保持不变
- `logger({ format: 'json' })` 输出结构化 JSON 到 stderr，自动附带 traceId
- `currentTraceId()` 可在任意中间件/handler 中调用
- 生产环境推荐：`app.use(logger({ format: 'json' }))`

### 工作量估计：3-4 天

✅ **已完成**

- `serve.ts` trace 注入：0.5 天
- `logger.ts` 重构：1 天
- postgres 慢查询接入：0.5 天
- agent/opencode/messager trace 接入：1 天
- 测试：0.5 天

---

## 三、AI 可观测性面板 ⭐⭐

### 问题

agent 模块跑完了，用户不知道：

- 用了多少 token？
- 花了多少钱？
- 哪次调用失败了？
- opencode 一个 session 总共烧了多少？

### 方案

新增 `agent` 模块的内置分析能力，复用 `analytics` 模块的模式：

#### 3.1 Agent 运行日志表

```sql
CREATE TABLE _agent_runs (
  id          SERIAL PRIMARY KEY,
  agent_id    INTEGER NOT NULL REFERENCES _agents(id),
  input       TEXT,                    -- 用户输入摘要
  output      TEXT,                    -- agent 输出摘要
  model       TEXT,
  tokens_in   INTEGER DEFAULT 0,
  tokens_out  INTEGER DEFAULT 0,
  elapsed_ms  INTEGER,
  status      TEXT DEFAULT 'success',  -- success | error
  error_msg   TEXT,
  trace_id    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
)
```

#### 3.2 修改 `agent.run()` 自动记录

```ts
// agent/run.ts — 在 createRunner 的 run() 中：
async function run(agentId: number, params: RunParams): Promise<RunResult> {
  const start = Date.now()
  try {
    const result = await doRun(...)
    // 记录成功
    await sql`INSERT INTO _agent_runs ...`
    return result
  } catch (err) {
    // 记录失败
    await sql`INSERT INTO _agent_runs ... (status = 'error', error_msg = ...)`
    throw err
  }
}
```

#### 3.3 Dashboard 端点

```
GET /agents/:id/runs?days=7    → JSON 运行历史
GET /agents/:id/runs/summary   → JSON 汇总（总调用、总 token、成功率、P50/P95 耗时）
```

#### 3.4 opencode session 汇总

opencode 已经在 `_opencode_messages` 里记 `tokens_in / tokens_out`。新增聚合端点：

```
GET /opencode/sessions/:id/usage   → { total_tokens_in, total_tokens_out, cost_estimate }
```

### 工作量估计：3-4 天

✅ **已完成**

- `_agent_runs` 表：自动记录每次 agent.run() 的输入/输出/token/耗时/状态/trace_id
- `GET /agents/:id/runs?days=7` — 运行历史（最多 100 条）
- `GET /agents/:id/runs/summary?days=7` — 聚合统计（总数/成功率/token/P95耗时）
- `GET /opencode/sessions/:id/usage` — session token 用量
- 流式调用记录 `status: 'stream'`，非流式记录完整 token 数据

---

## 四、Agent ↔ Messager 深度打通 ⭐⭐

### 问题

当前 `messager({ agents })` 只做了最基础的路由——用户发消息 → agent 跑 → 回结果。没有：

- 流式输出（agent 一个字一个字回）
- 进度汇报（「正在读取 3 个文件...」）
- 上下文保持（频道里多轮对话）

### 方案

#### 4.1 流式 Agent 回复

```ts
// messager/agent.ts — 改 runAgentRouting

// 当 agent 支持 stream 时：
const result = await agents.run(agentId, { input, stream: true })
if ('stream' in result) {
  const reader = result.stream.getReader()
  // 逐块写入 websocket，hub.broadcast 每个 token
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    hub.broadcast(`messager:${channelId}`, {
      type: 'agent_stream',
      data: { agentId: am.member_id, token: decoder.decode(value) },
    })
  }
}
```

#### 4.2 频道内多轮对话

当前 messager 是把频道消息发给 agent 单次处理。应该改为：

- 按 `(channelId, agentId)` 维护对话上下文
- 摘要历史消息（最近 N 条）注入 agent 的 messages 参数
- 用户在频道里 @agent → agent 能记住前面的对话

#### 4.3 前端适配

```tsx
// react 侧 — useWebsocket 已支持。新增 hook 专门处理 agent 流式消息
import { useAgentStream } from 'weifuwu/react'
const { messages, typing } = useAgentStream(channelId)
// messages 实时追加 agent 的 token
// typing 表示 agent 正在生成
```

### 工作量估计：2-3 天

✅ **已完成**

- `messager/agent.ts` 完全重写：支持流式 agent 回复 + 多轮对话上下文
  - 流式模式：agent 逐 token 通过 hub broadcast 到频道，客户端实时显示
  - 非流式模式：保持原有行为
  - 多轮上下文：自动获取频道最近 N 条消息注入 agent 的 messages 参数
  - SSE 事件解析：`text-delta` → token 广播，`error` → 错误通知，stream 结束 → 最终消息 + `agent_stream_end`
- `use-agent-stream.ts`：React hook `useAgentStream(wsPath, channelId)`
  - 返回 `{ stream: { streams, streaming, activeAgents }, getAgentText, isAgentStreaming }`
  - 自动处理 token 累积、流结束、错误恢复
- `react.ts` 导出 `useAgentStream` 及类型

---

## 五、测试辅助工具 ⭐

### 问题

当前每个测试都要自己构造 `new Request(...)` + `{ params: {}, query: {} }`，啰嗦且易错。

### 方案

新增 `test/utils.ts`（或直接导出 `testApp` helper）：

```ts
// 新 API —— 测试专用
import { testApp } from 'weifuwu'

const app = testApp()
app.use(postgres({ connection: TEST_DATABASE_URL }))
app.get('/users/:id', (req, ctx) => {
  return Response.json({ id: ctx.params.id, user: ctx.user })
})

// 链式调用，自动处理 Request 构造 + Context 初始化
const res = await app.get('/users/42').withUser({ id: 1, email: 'test@test.com' }).send()

assert.equal(res.status, 200)
assert.deepEqual(await res.json(), { id: '42', user: { id: 1, email: 'test@test.com' } })
```

### API 设计

```ts
interface TestRequest {
  // 设置请求头
  header(name: string, value: string): TestRequest
  // 设置 ctx 上的属性（模拟中间件注入）
  with(mixin: Partial<Context>): TestRequest
  // 快捷方法
  withUser(user: unknown): TestRequest
  withTenant(tenant: TenantContext): TestRequest
  withSql(sql: Sql<{}>): TestRequest
  // 设置请求体
  body(data: unknown): TestRequest
  // 发送
  send(): Promise<TestResponse>
}

interface TestResponse {
  status: number
  headers: Headers
  json<T = unknown>(): Promise<T>
  text(): Promise<string>
}

interface TestApp {
  get(path: string): TestRequest
  post(path: string): TestRequest
  put(path: string): TestRequest
  patch(path: string): TestRequest
  delete(path: string): TestRequest
}
```

### 实现

纯包装层，不需要改 Router 核心。`testApp` 内部调用 `router.handler()`。

### 工作量估计：1-2 天

✅ **已完成**

- `test-utils.ts`：`testApp()` 创建测试应用，链式调用的 `TestRequest`/`TestResponse`
  - `testApp().get('/path', handler)` 注册路由
  - `app.getReq(path).withUser(...).header(...).body(...).send()` 发送请求
  - `res.status`、`res.json<T>()`、`res.text()` 断言
  - 支持 `withUser()`、`withTenant()`、`with()` 模拟中间件注入
  - 自动解析 query params
  - 兼容 Node.js native TS（无 parameter properties 等 strip-only 不支持语法）
- 从 `'weifuwu'` 直接导入 `testApp`、`TestApp`、`TestRequest`、`TestResponse`
- 新增 9 个 test-utils 自测

---

## 六、代码质量：内部重构（不对外暴露） ⭐

### 6.1 ssr.ts 拆解

当前 `ssr.ts` 是 400+ 行的单体文件，涵盖：文件扫描、layout 发现、路由匹配、编译、版本控制、HMR、bundle。应拆为：

```
ssr/
  index.ts       → 入口 + Router 组装
  scanner.ts     → 文件扫描 + layout 发现
  compiler.ts    → esbuild 编译逻辑
  bundle.ts      → hydration bundle 生成
  handler.ts     → 路由匹配 + 渲染
```

### 6.2 opencode 抽象共用

`agent/run.ts` 和 `opencode/run.ts` 有重复的模式（streamText 调用、tool 注入、错误处理）。抽一个公共的 `ai/runner.ts` 供两者复用。

### 6.3 内部 import 清理

- 统一 `import type` 用于类型导入（减少循环依赖风险）
- `vendor.ts` 的 `type` 导出检查 —— 确保 runtime 不加载不必要的模块

✅ **已跳过** — ssr.ts 270 行已按注释分块，agent/opencode 模式差异大（SSE vs AsyncGenerator），拆开不增加可读性。无代码重复。

---

## 七、不做的事（明确边界）

| 不做            | 原因                                    |
| --------------- | --------------------------------------- |
| 支付/订阅模块   | 框架层不该管钱                          |
| MCP Server 集成 | 留给 0.21，先做核心打通                 |
| Admin UI 全量   | 先有 API 面板（3.4），全量 UI 留给 0.21 |
| HTTP/2 / HTTP/3 | 反向代理的事                            |
| Webhook 系统    | queue 够用                              |
| CRDT 协同编辑   | 偏离主线                                |
| 新模块          | 收敛期，25 个模块已过多                 |

---

## 实施顺序 & 里程碑

```
Week 1:  一（ctx 类型推导）         → 改 types.ts + router.ts + 10 个模块类型
Week 2:  二（Tracing + 日志）       → serve.ts trace + logger 重构
Week 3:  三（AI 可观测面板）        → agent run 日志 + dashboard 端点
Week 4:  四（Agent ↔ Messager 打通） → 流式 + 多轮 + 前端 hook
Week 5:  五 + 六（测试工具 + 重构）  → testApp + ssr 拆解 + 共用层
```

每周末 cut 一个预发布版本：

- `0.20.0-alpha.1` → 类型安全完成
- `0.20.0-alpha.2` → 可观测性完成
- `0.20.0-beta.1` → AI 面板完成
- `0.20.0-rc.1` → Agent ↔ Messager 打通
- `0.20.0` → 全量发布

---

## 验收标准

1. **类型安全**：IDE 中 `ctx.user.email` 有自动补全且类型正确
2. **Tracing**：每个响应带 `X-Trace-Id`，所有模块日志可追溯
3. **Agent 面板**：`GET /agent/:id/runs/summary` 返回正确的 token 统计和成功率
4. **流式 Agent 聊天**：messager 频道里 agent 回复逐字出现
5. **测试 DX**：用 `testApp` 写测试减少 50% 代码量
6. **零破坏性变更**：现有所有测试继续通过
