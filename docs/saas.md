# SaaS 地基模块（weifuwu）

五个模块（限流 / 邮件 / 用户系统 / 消息系统 / 队列）+ AI 对话，以中间件形态随包提供，`app.use(...)` 一行接入。

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

四个内建模块组成一个"基本 SaaS 底座"：认证、异步任务、限流、邮件——零新增依赖
（只依赖已自研的 redis / postgres 客户端与 node 标准库）。

## rateLimit — 限流

```ts
import { rateLimit } from 'weifuwu'

app.use(redis())                                        // 依赖 ctx.redis
app.use(rateLimit({ windowMs: 60_000, max: 100 }))      // 全局限流（默认固定窗口）

app.get('/api/search', async (req, ctx) => {
  await ctx.limit('search', { max: 30, windowMs: 60_000 })  // 手动限流，超限抛 429
})

// 登录/注册防爆破：ctx.limit 默认按 IP 维度（每 IP 独立计数）
app.post('/api/auth/register', async (req, ctx) => {
  await ctx.limit('register', { max: 5, windowMs: 60_000 }) // 每 IP 每分钟 5 次
})

// 系统级总量限制：scope: 'global' 全局共享维度
await ctx.limit('total-jobs', { max: 1000, windowMs: 60_000, scope: 'global' })

// 登录防爆破（配合 userSystem）：组合键 ip:email（key 接收标准 Request，取头拿 IP）
app.use(rateLimit({ key: (req) => `login:${req.headers.get('x-forwarded-for')}:${req.headers.get('x-user-email')}`, max: 5, windowMs: 15 * 60_000 }))
```

| 选项 | 默认 | 说明 |
|------|------|------|
| `windowMs` | `60000` | 时间窗口 |
| `max` | `100` | 窗口内最大请求 |
| `key` | X-Forwarded-For | 限流键（生产环境配置反向代理注入） |
| `algorithm` | `fixed` | `fixed`（INCR+EXPIRE，原子）\| `sliding`（ZSET，仅 redis） |
| `store` | `redis` | `redis`（多实例一致）\| `memory`（仅单实例/开发） |

- 响应自动带 `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` / `Retry-After`
- 多实例共享计数：计数在 redis，水平扩展天然一致

## email — 邮件发送

```ts
import { email } from 'weifuwu'

app.use(email({ from: 'no-reply@your.app', adapter: 'resend', resend: { apiKey: process.env.RESEND_API_KEY } }))
// 或 adapter: 'smtp' + smtp: { host, port, user, pass }（自研 SMTP 客户端，零依赖）

app.post('/api/notify', async (req, ctx) => {
  await ctx.email.send({ to: 'user@x.com', subject: '通知', html: '<h1>hi</h1>' })
})
```

- 适配器：`resend`（默认，一个 POST）/ `smtp`（自研 node:net + node:tls：EHLO/STARTTLS/AUTH PLAIN/DATA/dot-stuffing，非 ASCII subject 自动 RFC2047 编码）/ 自定义函数
- 裁剪：附件、退信/送达率（服务商职责）、批量营销不支持

## userSystem — 用户系统

```ts
import { userSystem } from 'weifuwu'

const db = postgres()
await db.migrate()
const users = userSystem({ sql: db.sql, secret: process.env.AUTH_SECRET })
await users.migrate()          // 幂等建表（users + sessions）
app.use(db)
app.use(users)                 // 注入 ctx.user / ctx.auth
users.routes(app)              // POST /api/auth/register|login|logout|refresh + GET /api/auth/me

app.get('/me', (req, ctx) => ok(ctx.user))        // 已注入
app.post('/secure', (req, ctx) => { ctx.auth.requireAuth(); ... })
```


> ⚠️ **weifuwu/client 已删除**——前端运行时唯一入口为 `weifuwu/ui-dom`，见 [frontend-ui-dom.md](frontend-ui-dom.md)。
- **安全基线**：scrypt 密码哈希（per-user salt + timing-safe，异步不阻塞）；access token = HMAC-SHA256 JWT（与 `weifuwu/client` 的 `auth()` 天然配对）；refresh token = 不透明随机串，DB 只存哈希，logout/轮换即撤销
- **防枚举**：登录失败统一 401（不泄露邮箱是否存在）
- **`ctx.auth` 方法面**：`register` / `login` / `logout` / `requireAuth` / `setPassword(userId, newPwd)` / `createToken(type, payload, { ttlSeconds })`（邮箱验证/密码重置自接）
- **多租户感知**：`issueSession` 的 token payload 携带 `tenantId`（来自 `user.tenant`）——中间件自动注入 `ctx.tenantId`，并将会话字段（userId/tenantId/email/name/role）合并到 `ctx.auth`，多租户应用免写 token 解码/租户中间件（数据隔离 SQL 是应用职责）
- **`routes` 支持 `exclude`**：`users.routes(app, { exclude: ['register'] })`——应用自定义注册流程（如注册时建租户）时跳过框架路由
- **裁剪**：OAuth、邮箱验证邮件（给底层 API 自接）、多因素、RBAC 权限引擎（只留 `role` 字段）、租户隔离 SQL（框架只做感知，`WHERE tenant_id` 属应用层）

## messager — 消息系统

```ts
import { messager } from 'weifuwu'

const db = postgres()
await db.migrate()
const msg = messager({ sql: db.sql, redis: rds })   // redis 可选：跨进程广播
await msg.migrate()            // 幂等建表（conversations + members + messages）
app.use(db)
app.use(msg)                   // 注入 ctx.msg
msg.routes(app)                // /api/messages/*（会话/历史/发消息/已读）
app.ws('/ws', msg.handler())        // 标准 WS 协议内置

// 业务代码：持久化 + 鉴权 + 广播 + 未读 + 历史，一次调用
const conv = await ctx.msg.createConversation(ctx.user.id, { type: 'group', memberIds: ['u2'] })
await ctx.msg.sendMessage(conv.id, { senderType: 'user', senderId: ctx.user.id, content: '你好' })
ctx.msg.broadcast(`conv:${conv.id}`, { type: 'order_chat', orderId: 'o1' })  // 任意实时事件
ctx.msg.sendTo('u2', { type: 'mention' })       // 用户维度点对点
```

- **数据模型**：`_weifuwu_conversations` / `_weifuwu_conversation_members` / `_weifuwu_messages`（`sender_type + sender_id` 不 FK users——user/agent/system 消息天然可存）；direct 会话同对用户唯一、历史游标分页、未读数（`last_read_at`）、编辑/删除软删
- **实时协议内置**：`handler()` 提供 `connected / subscribe→subscribed / unsubscribe / ping→pong`——前端 `ctx.ws.send({ type: 'subscribe', room })` 直接可用，两端协议由框架定义
- **跨进程**：`redis` 选项 → Redis pub/sub 广播（psubscribe 模式），多实例部署天然一致；无 redis 优雅降级单进程。
  **环回去重**：`broadcast` = 本地直发 + Redis publish，本实例的 subscriber 会收到自己 publish 的消息——publish 携带实例唯一标识 `_pid`（`wf:{pid}:{seq}`），订阅回调跳过自己的环回，保证每个事件恰好投递一次（防 token 级事件重复/乱序）
- **与 userSystem 咬合**：`sendTo(ctx.user.id)` 按身份路由、`createConversation(ctx.user.id)` 创建者即身份、成员校验自动对齐——身份是消息的路由，消息是身份的交互
- **裁剪**：已读回执状态机（只做未读数）、附件存储、全文搜索、消息确认/重试（可靠投递用 queue）、移动端推送

## queue — 可靠任务队列

```ts
import { queue } from 'weifuwu'

const q = queue()              // 默认 REDIS_URL
app.use(q)                     // 注入 ctx.queue

app.post('/api/generate', async (req, ctx) => {
  await ctx.queue.add('llm.batch', { prompt: '...' }, { attempts: 3 })
  return new Response(null, { status: 202 })  // 立即 202，任务后台执行
})

// 消费者（独立进程或同进程均可，多开安全）
const worker = q.worker('llm.batch', async (job) => {
  await runLLM(job.data)       // 失败自动重试 → 用尽进 DLQ（q:llm.batch:dead）
}, { concurrency: 5, visibilityTimeout: 30_000 })
await worker.start()
await worker.stop()            // 优雅停止
```

- **语义**：at-least-once（handler 可能重复执行——幂等由业务保证）；Redis Streams 消费组，多 worker 实例不重复消费
- **可靠性**：失败 → 延迟重试（间隔 = `visibilityTimeout`，ZSET 延迟队列）→ attempts 用尽 → DLQ；worker 崩溃 → pending 由其他实例 `XAUTOCLAIM` 接管
- 裁剪：延迟调度（除重试外）、cron、优先级、指数退避、速率限制不支持

## ai — LLM 对话（自研协议 + 零依赖客户端）

```ts
import { ai } from 'weifuwu'

const a = ai()          // DEEPSEEK_API_KEY / BASE_URL / MODEL 自动读 env，默认 deepseek-v4-flash
app.use(a)              // 注入 ctx.ai（worker/非请求场景也可直接 a.chat()）

// 流式对话：路由一行返回 SSE（wf: 协议，详见 design/ai-contract.md）
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.ai.stream({ messages }, {
    signal: req.signal,                                    // 断开即取消 provider 请求
    traceId: req.headers.get('x-trace-id') ?? undefined,   // 追踪关联（协议 §7）
  })
})

// 非流式（worker/后台）：
const res = await a.chat({ messages: [{ role: 'user', content: 'hi' }] })

// agent 引擎：工具循环 + 人工审批（HITL）
const agent = a.agent({
  systemPrompt: '你是助手。查询天气时调用 query_weather 工具。',
  tools: [{
    name: 'query_weather',
    description: '查询城市天气',
    parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    run: async (args, { emit }) => {
      emit('wf:tool_progress', { toolCallId: 'x', step: 1, total: 2, message: '查询中…', status: 'running' })
      return { city: args.city, temp: 25 }
    },
  }],
  humanInTheLoop: true,   // 每个工具执行前等人工审批
})

app.post('/api/agent', async (req, ctx) => {
  const { messages } = await req.json()
  return agent.run(messages, { signal: req.signal, traceId: req.headers.get('x-trace-id') ?? undefined })
})

// HITL 审批响应（前端点"允许/拒绝" → POST 到这里）
app.post('/api/approve', async (req, ctx) => {
  ctx.ai.approve(await req.json())   // { id, decision, modifiedArgs?, note? }
  return new Response(null, { status: 200 })
})
```

前端解码（`weifuwu/client`）：

```ts
import { aiStream } from 'weifuwu/client'

const handle = aiStream('/api/chat', { messages }, {
  onToken: (text) => { /* 增量 append 到消息 */ },
  onToolCall: (call) => { /* 渲染工具卡片 */ },
  onDone: () => { /* 收尾 */ },
  onError: (e) => { /* 按 e.code 降级 */ },
  onEvent: (name, data) => { /* x:* 自定义事件透传 */ },
})
handle.abort()  // 用户停止/组件卸载/导航跳走
```

前端对话层（会话语义 + 标准界面，协议对页面透明）：

```tsx
// ctx.ui.useChat：会话语义（消息累积/工具内嵌/审批/重试），返回页面同一个 $
const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
// $.messages / $.input / $.streaming / $.error / $.usage / $.step
// $.send() / $.stop() / $.retry() / $.clear() / $.approve('approved', note?)

// AiChat：标准对话界面（气泡 / 工具卡 / 审批卡 / 自动滚动 / 错误重试）
return () => <AiChat chat={$} />

// agent 模式消息内嵌：msg.toolCalls（ToolCallCard 直接消费）/ msg.approval（ApprovalCard）
```

> 分层：`ctx.ai`（后端协议）→ `aiStream`（传输解码）→ `useChat`（会话语义）→ `AiChat`（标准界面）。要完全自定义 UI 的应用用 useChat + 自有渲染；要 5 分钟出界面用 AiChat。

- **协议**：`wf:` 命名空间（message_start/token/tool_call/tool_progress/usage/done/error + agent 扩展 step/approval_request），SSE 下行 + POST 上行，错误即值、未知事件透传、`x:*` 自定义事件（详见 [design/ai-contract.md](../design/ai-contract.md)）
- **agent 引擎**：`a.agent({ systemPrompt, tools, humanInTheLoop })` 工具循环（LLM → tool_call → 执行 → 回喂 → 重复）；工具可 `emit` 进度/自定义事件、接收 `signal` 取消；HITL 审批（`ctx.ai.approve` 响应，拒绝≠终止、modified 改参、超时兜底）
- **emitter 抽象**：`agent.stream(messages, { emit })`——`wf:*` 事件（step/token/tool_result/usage/done）可接任意通道（SSE/WS/回调），协议不焊死在传输层；`agent.runToResult(messages)` 返回结构化结果 `{ content, steps, usage }`（非流式/worker 场景）
- **embedding**：`ctx.ai.embed(text)` / `embedMany(texts)` 向量化（默认 `DASHSCOPE_API_KEY` + `text-embedding-v4`，compatible-mode 端点）；未配置抛 `AiError('unsupported')`（惰性检查，不静默降级）——知识库/语义检索开箱即用
- **零依赖**：自研 OpenAI 兼容客户端（fetch + SSE 解析），默认 DeepSeek，`baseUrl` 可换任意 OpenAI 兼容端点（Ollama/vLLM/Moonshot…）
- **追踪**：前端自动生成 `X-Trace-Id` → 后端以之作为 `message_start.id` → 工具内请求继承同一 traceId，整个 agent run 一次搜完
- **裁剪**：Anthropic 原生协议、审批持久化（连接断=会话亡）暂不支持；多 agent 编排不承诺（子 agent = 工具已支持）；embedding 仅文本（图片/多模态不做）

## 组合示例：注册 → 验证邮件 → 欢迎任务 → 登录防爆破

```ts
app.use(redis())
app.use(rateLimit({ key: (req) => `login:${req.headers.get('x-forwarded-for')}`, max: 5, windowMs: 60_000 }))  // 防爆破
app.use(email({ from: 'no-reply@x.com', adapter: 'resend', resend: { apiKey } }))
app.use(db)
app.use(users)
users.routes(app)

// 注册：限流守卫 → 用户系统 → 验证邮件 → 欢迎任务入队
app.post('/api/auth/register', async (req, ctx) => {
  await ctx.limit(`register:${req.ip}`, { max: 10, windowMs: 60_000 })
  const result = await ctx.auth.register(await req.json())
  const token = ctx.auth.createToken('verify', { sub: result.user.id }, { ttlSeconds: 86400 })
  await ctx.email.send({ to: result.user.email, subject: '验证邮箱', html: `...?token=${token}` })
  await ctx.queue.add('welcome.flow', { userId: result.user.id })
  return created(result)
})

const worker = q.worker('welcome.flow', async (job) => { /* 欢迎流程 */ })
await worker.start()
```
