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
- [7. workflow 执行引擎](#7-workflow-执行引擎)

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

## 7. workflow 执行引擎

`src/server/workflow/`——声明式执行引擎（WorkflowDef 线性步骤链 → ctx 数据流 → RunResult）。
入口：`workflow({ ai?, email?, redis?, fetch?, log? })`（模块即客户端，worker 直接调用）——
不做调度装配（cron/队列由消费方组合 scheduler/queue 实现）。

```ts
import { workflow } from 'weifuwu'
const wf = workflow({ ai: a, email: mail, redis: redisClient.redis }) // 适配器可选

const def = {
  id: 'stock-monitor',
  steps: [
    { id: 'probe', type: 'http', config: { url: 'https://api.test/stock' } },
    { id: 'gate', type: 'if', config: { when: 'steps.probe.data.json.items', edge: true } },
    { id: 'mail', type: 'email', config: { to: 'ops@x.com', subject: '预警', body: '{{steps.probe.data.json.items}}' } },
  ],
}
wf.validate(def)                   // → { ok, errors[] }（LLM 生成 / 配置共用闸门）
const r = await wf.execute(def)    // → RunResult；execute(def, { mode: 'dry' }) 副作用打桩
```

**语义红线**（`src/server/workflow/*.test.ts` 契约锁定——118 契约）：

| 语义 | 定版 |
| --- | --- |
| 表达式 | JS 语义子集（手写递归下降——无 eval）：`===`/`==`/`!==`/`!=`/比较/算术（严格防呆：`'1'+1` 抛错）/三元/`&&`/`||` 返回操作数/`[*]` 投影/`.length`/std 纯函数调用（需 import） |
| 布尔语境 | **JS truthy**：0/false/''/null/undefined → false；'0' 与 [] 为 true（JS 一致） |
| 比较 | 宽松 `==`/`!=` 保持 JS（'200'==200）；严格 `===`/`!==` 亦支持 |
| 短路 | 步骤级 `when` 不通过 → 跳过（skippedSteps）**后续继续**；`if` 分支条件 false → 跳过分支子链继续 |
| 去重 | **无原语**（once/edge 已删）——失败不记账、发送重试 at-least-once 由 store 显式记账：`store.get/set` 用户自查（库存监控首例） |
| dry-run | effects 步骤打桩 `{ok,dry}`；http 真跑（用户要看数据） |
| 每步输出 | `{ ok, data?, error? }` 落 `steps.<id>`（ctx.steps 与 RunResult.stepResults 同引用） |
| 内置步骤 | http / template / log / ai（需 ai 适配器）/ email（需 email 适配器）/ store（需 store/redis 注入）——缺适配器报明确错误，不静默跳过 |

**wfjs 是完整语言**（compileWfjs 编译 → WorkflowDef）；`toJs(def)` 渲染回源码——round-trip 恒等（fuzz 500 对）：

- 控制流：`if/else`、`while`、`for…of`、`return`（顶层=终止；函数内=返回值）、`break` 等 JS 对齐形态
- 函数：`function f(params) { … }` 纯逻辑体 + `await f(args)` 调用（return 落 `steps.<id>.data`）——函数体禁副作用内置/嵌套调用/外层步骤引用（v1 裁剪）
- 模块：`import { x } from 'wf://std/…'`（内置库）+ `import { x } from 'https://…'`（远程——compileWfjs({ remoteFetch }) 编译期抓取快照物化，运行期零 IO；白名单仅 `{ functions }` 根）+ `export { f }`（函数库形态）
- 约束：`std` 函数需 import 才可见（ESM 一致）；表达式内仅 std 纯函数（副作用内置仅语句层）；变量全局唯一命名空间（v1）

**执行**：Runner 递归子链（assign/if/while/for/return/call）+ 局部 vars + 循环栈（嵌套恢复）+ maxIters 默认 1000 + 函数递归深度 64。

**裁剪（诚实）**：函数提升 v2（先声明后调用）；块级遮蔽 v2（全局唯一命名空间）；函数体内函数调用 v2；远程模块不支持嵌套导入/环检测（纯数据单层）；DAG/子 workflow 结构化可编程为 v2 候选；框架只做执行，REST/UI/多租户/对话生成由消费方接入（agent-platform 第二阶段）。

---

> **运行**：`npm run test:server`（163 契约）· 直跑
> `node --env-file=.env --test src/server/core/*.test.ts src/shared/router/*.test.ts`
> —— db 真库依赖 docker（无 docker 跑 `src/server/core/*.test.ts` 子集）。
