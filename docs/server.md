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
| `postgres()` | `ctx.orm` | PG v3 自研协议——ORM AST 面（业务零 SQL 文本——见 §5 数据层） |
| `redis()` | `ctx.redis` | RESP2 自研协议 |
| `scheduler()` | `ctx.schedule` | 任务调度（持久化/恢复） |
| `queue()` | `ctx.queue` | 任务队列（worker/retry/backoff） |
| `messager()` | `ctx.msg` | 部门内部消息（面向 agent） |
| `userSystem()` | `ctx.auth`/`ctx.user` | 注册/登录/token/角色/租户 |
| `rateLimit()` | — | 令牌桶（per-key/per-user） |
| `email()` / `MemoryEmail()` | `ctx.email` | 邮件接口（HTTP API 发送——Resend 兼容端点——不直连 SMTP）；`new MemoryEmail({ onSend })` 内存确定性（测试/离线） |
| `OpenAi()` / `MemoryAi()` | `ctx.ai` | AI 接口（AIInterface——LLM/embedding/多模态）；正门构造：`new OpenAi({ apiKey })`（OpenAI 兼容）/ `new MemoryAi({ onChat })`（确定性内存——测试/离线） |
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
| `DASHSCOPE_*` | embedding + 多模态 provider（图片/视频） | `ai({ embedding })` / `ai()` | `deepseek` 同域 / `dashscope.aliyuncs.com` |
| `RESEND_API_KEY` / `SMTP_*` | 邮件 adapter | `email()` | `localhost:3025` |
| `PORT` | 服务端口 | `serve()` | `3000` |

## 3.5 AI 接口（AIInterface——provider 可插拔）

参考 PostgresInterface 分层（契约/工厂/引擎分离——`src/server/ai/`）：

```
contracts.ts   AIInterface（契约——Ai 兼容别名）+ 多模态请求/响应类型 + Context.ai 声明单源
client.ts      OpenAI 兼容 transport（chat/stream/agent 引擎依赖面 = AiClient）
multimodal.ts  DashScope 多模态（图片 z-image-turbo / 视频 happyhorse 异步任务——provider 语义）
memory.ts      MemoryAi（参考 MemorySql：契约直实现——确定性——onChat/onEmbed/onImage 注入）
memory-server.ts MemoryAiServer（参考 MemoryPostgresServer——协议替身——测试用）
index.ts       模块 re-export（OpenAi/MemoryAi/AiClientModule——选择器已废——正门构造）
```

- **正门构造**：`new OpenAi(opts)` / `OpenAi(opts)`（env 读 DEEPSEEK_*——无 key 明确
  throw）与 `new MemoryAi(opts)` / `createMemoryAi(opts)`（不读 DEEPSEEK_*——无 key
  可用——测试/离线）——两者都返回 AiClientModule（`app.use` 注入 `ctx.ai`）
- **多供应商平级配置**：聊天走 `baseUrl/apiKey/defaultModel`；`embedding` / `image` /
  `video` 各自独立选项（各自 `baseUrl/apiKey/model`——可指向不同端点/不同 key/不同
  模型——如 chat=deepseek + embedding/image/video=dashscope）。默认模型：图片
  `z-image-turbo`、视频 `happyhorse-1.1-t2v`（复用现状常量）
- **多模态**：`ctx.ai.generateImage / createVideoTask / videoStatus`——**只做 provider
  语义**（不落盘/不建任务行/不轮询——编排属应用层）；视频参数归一在 provider
  层（枚举/时长夹紧/watermark）
- **MemoryAi**：`createMemoryAi({ onChat, onEmbed, onImage, onVideoSubmit, onVideoStatus })`——
  默认 echo 末条 user 消息 / djb2 确定性向量 / 1×1 占位图 / 视频立即 done——
  不编造 tool_calls（对齐 MemorySql「不支持的抛 unsupported」纪律）
- **MemoryAiServer**：`createMemoryAiServer({ port, onChat })`——OpenAI 兼容
  （/v1/chat/completions 流+非流、/v1/embeddings）+ dashscope 格式（图片/视频）——
  真实客户端（createAiClient / createDashscopeMultimodal）**零改动直连**——认证直过——
  测试用（DEEPSEEK_BASE_URL 指向）

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

## 5. 数据层（协议层 = AST——零 SQL 文本面）

> **生效规则（2026-09 协议 AST 化收口）**：业务/测试**禁止** SQL 文本面——
> sql 模板 / unsafe / whereRaw / SQL parser 已全链消亡（W3 删净——audit-orm
> 双范围 0 防回流）。唯一数据入口 = **ORM AST 面**（Query 纯数据——可序列化、
> 可契约断言）：
>
> ```ts
> // 查询（builder 构建 → AST 执行；协议传输 = toQuery() 纯数据）
> const rows = await ctx.orm.query.from('users')
>   .where({ age: { gt: 18 } }).orderBy('created_at', 'desc').limit(10).run()
> // 写：insert（多行/returning/onConflict EXCLUDED）/ update / delete（必须带 where）
> await ctx.orm.query.insert('users').rows([{ email: 'a@b.c', role: 'member' }])
>   .onConflict('email', true).returning('id').run()
> // 表绑定（shape 类型安全）与派生：ctx.orm.table('users', shape).select(...)
> // 测试播种/嵌入执行：orm.execute(query)（AST 直执行）+ createMemoryOrm()
> //   （内存引擎——零数据库测试）
> ```
>
> 全局规则：写入必须表达式化（merge 值 RawSql 仅限 `__now`/`__interval`/`__inc`
> 等内置算子——`query.ts` compileMergeVal 单一编码面）；DDL 走
> `migrateModule(name, SchemaModule)`（声明式——零 SQL 字符串）；迁移面
> `runMigration(name, sql)` 是 DDL 唯一合法文本面（业务查询禁）。

- **postgres**：`src/server/postgres/client.ts`——自研 PG v3 wire protocol
  （无第三方客户端依赖）——`postgres()` 返回 PostgresClient：`ctx.orm` 注入
  （ORM 唯一数据入口）+ migrate/migrateModule/runMigration/transaction
- **redis**：`src/server/db/memory-redis.ts` + `src/server/db/redis-server.ts`——
  自研 RESP2——`ctx.redis.get/set/pub`（命令面本身封闭——无 parser——保留）
- **Query Language（协议层 = AST）**：`src/server/db/`——`query.ts`（Query 类型 + compileQuery
  单向 SQL 编译——封闭输出）/ `query-builder.ts`（buildQuery——构建无执行面）/
  `orm.ts`（shape+operator+adapter 组合体）/ `memory-sql.ts`（MemorySql——AST 直执行
  双后端同构）——`createMemoryOrm()` 零数据库跑测试
- schema 迁移：`src/server/db/schema.ts`（SchemaModule → compileSchemaDdl 声明式 DDL）
  + `migrateModule` 执行记录（幂等——已迁移名跳过）

### 5.1 typedQuery——跨表查询类型化（2027-11 W3）

> **问题**：`orm.query.from(...)` 裸查询行类型恒为 `Row`（索引签名 unknown）——
> join/聚合查询的消费端被迫 `as unknown as X` 断言。**typedQuery 是纯类型面**
> （运行时 = SelectBuilder 链转发——零解析零成本）。

```ts
import { createTypedQuery } from 'weifuwu'
import { SHAPES } from '../db/shapes.ts'  // 平台：表名 → shape 注册表

const Q = createTypedQuery(orm, { kb_chunks: SHAPES.kb_chunks, kb_documents: SHAPES.kb_documents })

const rows = await Q.from('kb_chunks kc')                      // from spec: 表名 + 可选 alias
  .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })  // join alias 累积
  .select('kc.id', 'kc.content', 'kd.filename')                // 列引用：alias.col / 裸列=主表
  .vectorScore('kc.embedding', vec, 'similarity')              // pgvector 投影（AS 键并入行）
  .where({ 'kc.agent_id': { eq: String(agentId) } })           // where 列白名单校验
  .limit(5)
  .run()
// rows[0].id: string · rows[0].filename: string | null · rows[0].similarity: number
// rows[0].nope → 编译期红（未知列）；where({ 'zz.id': ... }) → 红（未注册 alias）
```

- 行类型规则：select 列键 = 去 alias 前缀（`kc.id` → `id`）；aggregate/vectorScore
  的 AS 键并入（number）；同名列后覆盖（判负面：需要别名键时用单表查询/聚合 as）
- 编译期红线：未知列 · 未知 alias · where 非法列 —— tsd 测试见
  `src/server/db/typed-query.test.ts`（typecheck:tests 守卫面）
- 判负（诚实裁剪）：`col AS alias` 键别名不做（聚合 as 参数已覆盖）；where 值
  ×列类型绑定不做（z.enum 字面量坍缩——见 §5.2）

### 5.2 shape 声明纪律（satisfies——字段字面量保留）

> **平台 shapes 唯一合法形态**：`export const agents = { ... } satisfies ZodRawShape`
> （**禁止** `: ZodRawShape` 注解——注解会让字段值坍缩为 ZodType<unknown> →
> `Infer` 全 unknown → tables() 行类型失效 → 消费端被迫 as unknown as）。

```ts
// ✓ satisfies（字段字面量保留——row.name: string · row.model: string | null）
export const agents = { id: f.pk(z.uuid()), name: f.req(z.string()) } satisfies ZodRawShape
// ✗ 注解（行类型坍缩——审计/tsc 面会持续捕杀）
export const agents: ZodRawShape = { ... }
```

- **行类型单源**：业务行接口（如 SandboxRow/VideoTaskRow）应从
  `RowOf<typeof SHAPES.xxx>` 派生——**禁止手动双写**（shape 改列 → 行类型联动）
- **枚举单源**（W4）：`z.enum(['ai','user'])` 字面量 tuple 推断（U 技巧——
  `Infer` = 'ai'|'user'——`eq(type,'robot')` 编译期红）；平台枚举值常量
  （如 `AGENT_TYPES`）从 shape 声明派生 DDL enum（加枚举值只改一处）
- **vector 列**：`z.vector(1024)`（Infer=`number[]`——embedding 不再
  ZodJson unknown）· 维度校验 · 内存/传输面按 json 数组承载；真库列型
  `vector(dims)` 经 SchemaModule columnTypes 特化（shape 语义单源）
- **守卫面**：`tsconfig.test.json` + `npm run typecheck:tests`（测试域类型错
  编译期拦截——tsd 断言真生效——负向验证：删 @ts-expect-error → 红）

## 6. 实时与渲染

- **scheduler**：`src/server/middleware/scheduler.ts`——`ctx.schedule.cron/once` +
  持久化恢复（重启续跑）
- **ui**：`ctx.ui.html/js/css/ssr`——TSX 动态编译（esbuild 同步）+ 组件 SSR
  （`src/ssr.ts`——SSR ≡ SPA 首帧纪律）
- **graphql**：`src/server/middleware/graphql.ts`——Schema-first
- **WebSocket**：`src/server/core/ws-hub.ts`——连接/房间/广播 + 心跳

---

## 7. workflow 执行引擎（含框架系统 workflowSystem）

> **框架系统**（对齐 messager/user 模式）：`workflowSystem({ sql, redis })`——存储/编排层（`src/server/workflows/`）：
>
> ```ts
> const wfs = workflowSystem({ orm: pg.orm, redis: redisClient?.redis })
> app.use(wfs)                     // 中间件：ctx.wf 注入（compileGate/execute/validate/dag/schema/defToWfjs）
> await wfs.migrate()              // 幂等建表：_weifuwu_workflows（def_json 真相 + src_wfjs 视图）/ _weifuwu_workflow_runs
> wfs.routes(app)                  // 可选内置 API（缺省 /api/workflows + ctx.auth.appId——user 会话透传——默认即安全）
> ```
>
> - **路由参数默认化**：prefix 缺省 `/api/workflows`；appId 提取器缺省 `ctx.auth?.appId`（user() 中间件会话透传——非 user 会话才需自定义）
> - **compileGate**：wfjs → compileWfjs（v0 无 remoteFetch——远程导入编译错=出网安全线）→ validate（变量自足/步骤 id 存在性）→ 通过才入库——LLM 生成/用户编辑共用闸门
> - **执行**：`workflow({ store: redisStore })` 引擎注册制——run 落库（status/args/result/error/时间戳——长任务由 runs 承载）
> - **视图适配**：`ctx.wf.dag(def)`（Pipeline 数据——子链折叠标签）/ `ctx.wf.schema()`（JsonSchema——JsonSchemaForm 直消费）
> - 引擎（语言/执行/视图适配）= 下方纯能力包 `weifuwu/workflow`（零依赖导出——compileWfjs/toJs/toJsonSchema/workflowToDag）

引擎入口

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
- 约束：`std` 函数需 import 才可见（ESM 一致）；表达式内仅 std 纯函数（副作用内置仅语句层）；**作用域对齐 JS**——块级遮蔽（mangle 内部名 x$N——round-trip 稳定）、函数提升、参数同名覆盖全局、不同函数参数互不干扰（v2）

**视图适配**（`workflow/views.ts`——纯数据转换，组件库零耦合——DSL 是枢纽真相，视角即适配）：

- `workflowToDag(def)` → `{nodes, edges}`——Pipeline 组件直接消费（v0：顶层线性链 + 子链折叠进标签 `条件 i（then×2/else×1）`）
- `toJsonSchema(stepSchemas())` → JsonSchema 对象——JsonSchemaForm 直接消费（按步骤类型组织 properties）

**执行**：Runner 递归子链（assign/if/while/for/return/call）+ 局部 vars + 循环栈（嵌套恢复）+ maxIters 默认 1000 + 函数递归深度 64。

**裁剪（诚实）**：嵌套函数定义（函数体内 function）；函数体内返回 await 调用（return 值是表达式——副作用调用仅语句层）；远程模块不支持嵌套导入/环检测（纯数据单层）；DAG/子 workflow 结构化可编程为 v2 候选；框架只做执行，REST/UI/多租户/对话生成由消费方接入（agent-platform 第二阶段）。

---

> **运行**：`npm run test:server`（163 契约）· 直跑
> `node --env-file=.env --test src/server/core/*.test.ts src/shared/router/*.test.ts`
> —— db 真库依赖 docker（无 docker 跑 `src/server/core/*.test.ts` 子集）。

### 5.3 确定性契约（ORM 三组件——状态机管理原则）

> **orm = shape + operator + adapter**——三组件内部状态确定，采用状态机管理
> （透明·可控·健壮）。**一致性铁律**：同一声明/同一算子在任何 adapter 行为
> 等价——不一致即 bug（修复而非登记）；声明了但无行为 = 不透明 = 定案
> （实现或移除——softDelete 判负先例：零行为 → 移除）。

**shape（单态冻结）**：构造即终态（不可变）；平台唯一合法形态 `satisfies
ZodRawShape`（§5.2）；行类型单源 `RowOf<SHAPES.xxx>`。

**operator（无状态纯函数）**：定义即值；值形态唯一（`{ eq: v }` / `{ in: [...] }`
/ `{ isNull: true }`——禁裸标量/数组/null）；**`{ eq: null }` = IS NULL**（双端
判空一致——真库不再编译 `= NULL` 恒假）。

**adapter（真状态机）**：
- MemoryTable 状态：`absent → (applySchema/DDL) declared` · `absent → (insert
  直建) observed`；observed 上 DDL 拒绝（对齐操作才允许）——`inspectTable()`
  状态可见面（契约断言）
- 行为矩阵：select 列校验 = 声明列集 vs 行键事实 · jsonb 解码 = columnTypes
  判定 vs 行键值启发 · ddl = alter vs 拒绝

**租户 scope（W1）**：
```ts
const pg = postgres({
  tenant: { field: 'app_id', value: (ctx) => (ctx as AppCtx).appId },
})
// 中间件自动：ctx.orm = orm.withCtx(ctx)——ctxTable 面自动 scope：
// select/update/delete 预置 tenant 条件 · insert 自动注入字段
const agents = await ctx.orm.ctxTable('agents').paginate({ limit, offset })
```
- scope 仅在 `ctxTable`（`table` 是无 scope 基础面——显式）
- **惰性求值**：tenant.value 每操作时读 ctx 当前值（pg 中间件先于 auth
  注册——appId 后注入——scope 仍生效）

**事务（W2）**：
```ts
await ctx.orm.transaction(async (tx) => {
  const T = tables(tx)          // tx 内表操作同连接/同链
  await T.a.insert(...).run()   // 任一失败整链回滚
  await T.b.insert(...).run()
})
```
- 真库：同连接真事务 · memory：单线程无并发交错（no-op 等价——诚实标注）
- 多写场景（survey 提交/演示空间 7 写）试点收口——先包原子链再加写

**分页（W5）**：`orm.ctxTable('x').paginate({ filter, sort, limit, offset })` →
`{ rows, total }`——count+list 单调用（同一 scope 面——不手写双查）

**透明面（诚实裁剪）**：
- FK 约束：memory 无校验面（真库 23503 → 400）——跨表引用依赖先插主行
- vectorScore 精度：内存余弦 vs 真库 ivfflat 近似——结果排序可能差异
- tx/ctx 派生面：`table(name)` 免 shapeDef（registry 共享——同名表幂等）

### 5.4 声明式 API 面（orm.gql / orm.rest——命名契约）

> **设计分层纪律**：HTTP client ←→ 协议面（graphql/restful）←→ handler（业务面）
> ←→ orm（数据面）。自动生成**不是绕过 handler**，是 **handler 默认实现的生成器**
> （解析→校验→租户→orm→响应→错误语义）；业务（权限/事务/编排/响应定制）
> 永远手写——以覆盖/钩子接缝在生成面之上。
>
> **判别标准（一票）**：_「除了 参数→orm→响应 还有别的行为吗？」有 → 手写；
> 没有 → 生成。_

**命名契约（一个词一个概念——学一个面等于学三个面）**：

| 概念 | 命名 | 说明 |
| --- | --- | --- |
| 数据面 | `shape`（f/z） | 唯一事实源 |
| 代码内查询 | `orm.table` / `typedQuery` | 类型化/跨表 |
| GraphQL 面 | `orm.gql(Table)` / `gqlFromShape(shapeDef, opts)` | 入口对称 |
| RESTful 面 | `orm.rest(Table)` / `restFromShape(shapeDef, opts)` | 入口对称 |
| filter→WhereExpr | `filterToWhere(filter, shapeDef)` | 三面共享单源 |
| 字段策略 | `fieldPolicy`（`hidden?: string[]` 首版） | 敏感列豁免——三面生效 |

**规则**：① 入口对称 `orm.<协议小写词>` ② 生成器对称 `<协议>FromShape`
③ `create*` 构造对象 / `*FromShape` 派生协议面——不混用 ④ 协议短名（gql/rest）
仅用于 orm 入口与生成器；HTTP 层协议中间件全称（graphql()/ui()/ws()）。

**gql 面（已有——`orm.gql(Table)`）**：shape → SDL + resolvers；Query
（list/one——filter/sort/limit/offset）· Mutation（insert/update/delete）；
租户 scope 自动注入；校验（insertSchema/updateSchema——API 边界）；
`hidden` 字段豁免（敏感列 SDL/返回双面不出现）。

**rest 面（W4——`orm.rest(Table)`）**：shape 派生路由组（list/one/
insert/update/delete——query 参数 schema/limit clamp/枚举白名单/404·204
语义/hooks before-after/字段策略）。

**真实化承诺**：SDL/路由表是 **shape 投影**——「声明了就有行为」，没有
「声明但静默跳过」（vector 列显式 [Float!]、未知字段显式报错）。
