# weifuwu 服务端文档（server）

> 后端开发者入口。**代码即文档**：本文件只写「地图 + 协议概要」——
> 细节全部指向源码/测试（协议类型定义就是规范本体）。

## 目录

- [1. 快速上手](#1-快速上手)
- [2. 中间件清单](#2-中间件清单)
- [3. 环境变量](#3-环境变量)
- [4. AI Stream Protocol](#4-ai-stream-protocol)
- [5. 数据层](#5-数据层)
- [6. 实时与渲染](#6-实时与渲染)

---

## 1. 快速上手

```ts
import { createServer, Router } from 'weifuwu'

const server = createServer()
server.route(Router()
  .get('/api/hello', (req, ctx) => ctx.json({ ok: true })))
server.listen(3000)
```

入口：`src/server/index.ts` · 路由内核：`src/server/core/`（Router/serve/WS hub——
与前端 UIRouter 共享 `src/shared/router/` trie/pipeline 五层单源）。

## 2. 中间件清单

`src/server/middleware/`——按 `ctx` 注入能力，Handler 从 ctx 读取：

| 中间件 | ctx 面 | 说明 |
| --- | --- | --- |
| `postgres()` | `ctx.sql` | PG v3 自研协议（无 pg 依赖） |
| `redis()` | `ctx.redis` | RESP2 自研协议 |
| `scheduler()` | `ctx.schedule` | 任务调度（持久化/恢复） |
| `queue()` | `ctx.queue` | 任务队列（worker/retry/backoff） |
| `messager()` | `ctx.msg` | 部门内部消息（面向 agent） |
| `userSystem()` | `ctx.auth`/`ctx.user` | 注册/登录/token/角色/租户 |
| `rateLimit()` | — | 令牌桶（per-key/per-user） |
| `email()` | `ctx.email` | resend/smtp 双 adapter |
| `ai()` | `ctx.ai` | LLM/embedding adapter（OpenAI 兼容） |
| `ui()` | `ctx.ui` | SSR + JS/CSS 编译（`html/js/css/ssr`） |
| `graphql()` | `ctx.gql` | GraphQL 层（Schema/Resolver） |
| `ws()` | `ctx.ws` | WebSocket hub（订阅/广播） |

依赖注入声明：`injects/depends`——`src/shared/router/ctx-fields.ts`（未注册依赖
抛错——类型/运行时双层）。

## 3. 环境变量

> 均可经中间件 options 显式传入（env 为默认来源）。默认值与代码对齐
> （`src/server/middleware/*.ts` 构造处）。

| 变量 | 用途 | 模块 | 默认 |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgres()` | —（必填） |
| `REDIS_URL` | Redis 连接串 | `redis()` | —（必填） |
| `AUTH_SECRET` | userSystem HMAC 密钥（≥16 字符） | `userSystem()` | — |
| `DEEPSEEK_API_KEY` | LLM provider key | `ai()` | — |
| `DEEPSEEK_BASE_URL` / `MODEL` | LLM 端点/模型 | `ai()` | `api.deepseek.com/v1` / `deepseek-v4-flash` |
| `DASHSCOPE_*` | embedding provider | `ai({ embedding })` | `deepseek` 同域 |
| `RESEND_API_KEY` / `SMTP_*` | 邮件 adapter | `email()` | `localhost:3025` |
| `PORT` | 服务端口 | `serve()` | `3000` |

## 4. AI Stream Protocol

**协议即类型**（单源）：`src/server/ai/types.ts`——修改协议先改此处，两侧实现对齐。

```
后端 → 前端（SSE 下行，wf: 事件——见 src/server/ai/sse.ts）
   wf:message_start / wf:token / wf:tool_call / wf:tool_progress
   wf:step / wf:approval_request / wf:usage / wf:done / wf:error
前端 → 后端（POST 上行——src/client/vdom/hooks/chat.ts 编码同构）
   provider 请求体 + 会话/工具调用回执
```

语义要点（实现于 `src/server/ai/*.ts` 与客户端解析器——**代码即规范**）：

- 错误即值（`wf:error` 事件——非 HTTP 异常通道）
- 未知事件透传（`x:*` 自定义扩展）
- HITL 审批：`wf:approval_request` → 拒绝≠终止 · modified 改参 · 超时兜底
- 追踪关联：`traceId` 全链路透传

消费端：`ctx.ai.chat()`（服务端流式）与 `useChat`（客户端会话语义层）。

## 5. 数据层

- **postgres**：`src/server/middleware/postgres.ts`——自研 PG v3 wire protocol
  （无第三方客户端依赖）——`ctx.sql.query/transaction`
- **redis**：`src/server/middleware/redis.ts`——自研 RESP2——`ctx.redis.get/set/pub`
- **Query Language**：`src/server/core/query-lang*`——AST 双后端（pg/内存——
  测试零外部依赖）——`Memory` 实现零数据库跑测试
- schema 迁移：`src/server/core/migrate*`

## 6. 实时与渲染

- **scheduler**：`src/server/middleware/scheduler.ts`——`ctx.schedule.cron/once` +
  持久化恢复（重启续跑）
- **ui**：`ctx.ui.html/js/css/ssr`——TSX 动态编译（esbuild 同步）+ 组件 SSR
  （`src/ssr.ts`——SSR ≡ SPA 首帧纪律）
- **graphql**：`src/server/middleware/graphql.ts`——Schema-first
- **WebSocket**：`src/server/core/ws-hub.ts`——连接/房间/广播 + 心跳

---

> **运行**：`npm run test:server`（163 契约）· 直跑
> `node --env-file=.env --test src/server/core/*.test.ts src/shared/router/*.test.ts`
> —— db 真库依赖 docker（无 docker 跑 `src/server/core/*.test.ts` 子集）。
