# agent-platform 计划

多租户 AI Agent 平台。自实现 AI 模块（DeepSeek LLM + DashScope Embedding），无第三方 AI 依赖。

---

## 1. 定位

属于 `weifuwu` 框架的用户空间应用。遵循 AGENTS.md 的原则：

> "Domain modules (user system, AI, messaging, knowledge base) are not bundled—they live in user space."

框架本身不做任何改动——`src/` 不动，`package.json` 不动。所有代码在 `apps/agent-platform/` 内自包含。

---

## 2. 依赖

| 类型 | 依赖 | 用途 |
|------|------|------|
| 框架 | `weifuwu` | 父项目，通过 tsconfig paths 引用 |
| 运行时 | 无 | AI 能力全部自实现，HTTP 调用用原生 `fetch` |

**不依赖 `ai` / `@ai-sdk/*`。** 两个供应商只走标准 HTTP REST：

```
DeepSeek  → POST {baseUrl}/chat/completions
DashScope → POST {baseUrl}/embeddings
```

---

## 3. 目录结构

```
apps/agent-platform/
├── server.ts                    # 应用入口 + 路由注册
├── tsconfig.json                # paths 引用父项目 src/
├── PLAN.md                      # 本文件
│
├── src/
│   ├── ai/                      # AI 核心模块（自实现）
│   │   ├── types.ts             # 所有类型定义
│   │   ├── deepseek.ts          # DeepSeek Chat Completions 客户端
│   │   ├── dashscope.ts         # DashScope Embedding 客户端
│   │   ├── stream.ts            # SSE 流解析器
│   │   └── agent.ts             # Tool Loop 引擎
│   │
│   ├── middleware/
│   │   ├── ai.ts                # ctx.ai 注入（核心中间件）
│   │   ├── auth.ts              # JWT 认证 + 租户隔离
│   │   └── tenant.ts            # 从 token 提取 tenant_id
│   │
│   ├── db/
│   │   └── schema.sql           # 完整 DDL
│   │
│   ├── routes/
│   │   ├── auth.ts              # 登录/注册
│   │   ├── agents.ts            # CRUD agent（4 种类型）
│   │   ├── departments.ts       # CRUD 部门 + 成员管理
│   │   ├── messages.ts          # 发送/获取消息
│   │   ├── companies.ts         # CRUD 公司
│   │   └── knowledge.ts         # 知识库上传/检索
│   │
│   └── services/
│       ├── agent-runner.ts      # Agent 执行编排（调用 ctx.ai.agent）
│       ├── chat.ts              # 消息路由 + 推送
│       ├── webhook.ts           # Webhook 消息收发
│       └── embedding.ts         # 文档分块 + 向量化 + pgvector 检索
│
├── ui/
│   ├── main.tsx                 # 前端入口
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Agents.tsx
│   │   ├── Departments.tsx
│   │   └── Chat.tsx
│   └── components/
│       ├── MessageList.tsx
│       └── AgentAvatar.tsx
│
├── scripts/
│   └── build.mjs                # esbuild 构建
│
└── public/
    └── index.html
```

---

## 4. 环境变量

```env
# === 已有（在父项目 .env 中） ===
DATABASE_URL=postgres://root:123456@localhost:5432/demo
REDIS_URL=redis://localhost:6379

# === DeepSeek LLM ===
DEEPSEEK_API_KEY=sk-xxx                                  # 必需
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1             # 默认
DEEPSEEK_MODEL=deepseek-v4-flash                          # 默认

# === DashScope Embedding ===
DASHSCOPE_API_KEY=sk-xxx                                  # 必需
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1  # 默认
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v4               # 默认

# === JWT ===
JWT_SECRET=org-dev-secret-key-2024
```

---

## 5. ctx.ai 接口设计

```ts
interface AiClient {
  // ── LLM 对话（DeepSeek） ──
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams & { onChunk, onToolCall?, onFinish? }): Promise<void>

  // ── Agent Tool Loop ──
  agent(config: AgentConfig): {
    run(messages): Promise<AgentRunResult>
    stream(messages, callbacks): Promise<AgentRunResult>
  }

  // ── Embedding（DashScope） ──
  embed(text: string): Promise<number[]>
  embedMany(texts: string[]): Promise<number[][]>
}
```

---

## 6. 数据模型

```
Tenant (租户) 1──N Company (公司)
Tenant 1──N User (用户)
Company 1──N Department (部门/群组)
Department N──M Agent (成员，多态)
Agent ──? User (若 type='user')

Agent 四种类型（单表继承）：
  ai              — DeepSeek LLM 驱动
  user            — 绑定真实用户
  webhook         — HTTP Webhook 收发
  knowledge_base  — PGVector 文档语义检索

Message → Department
KbDocument → Agent (type='knowledge_base')
```

---

## 7. Agent 四种类型的实现要点

| 类型 | 实现 |
|------|------|
| **AI Robot** | `ctx.ai.agent({ tools, systemPrompt, maxSteps })` → Tool Loop |
| **Real User** | 纯 DB 操作，通过 WS 收发消息 |
| **Webhook Bot** | `POST /webhook/:agentId` → `ctx.ai.chat()` → 返回响应 |
| **Knowledge Base** | 文档入库 `ctx.ai.embed()` → 存 pgvector → 检索 `ctx.ai.embed()` + `ORDER BY embedding <=>` |

---

## 8. Human-in-the-Loop

```
用户发消息 → 部门
  ├→ AI Agent 收到（WS push）
  │   ├→ 自动回复（humanInTheLoop=false）
  │   └→ 生成 draft + onStepEnd 等待审批（humanInTheLoop=true）
  │       └→ 管理员确认后发出
```

`onStepEnd` 中通过 Promise 阻塞实现等待：

```ts
agent.run(messages, ctx)  // 内部在 onStepEnd 中 await approval
  ↑                       // 直到外部调用 resolve()
  └── 审批弹出 ← WS通知管理员 ← 确认 → resolve()
```

---

## 9. 实现优先级

| 阶段 | 文件 | 估算行数 |
|------|------|---------|
| **P0 核心** | `src/ai/types.ts` | 80 |
| | `src/ai/deepseek.ts` | 120 |
| | `src/ai/dashscope.ts` | 80 |
| | `src/ai/stream.ts` | 50 |
| | `src/ai/agent.ts` | 200 |
| | `src/middleware/ai.ts` | 100 |
| | `server.ts` (基础路由) | 100 |
| | `tsconfig.json` | 10 |
| **P1 数据层** | `src/db/schema.sql` | 120 |
| | `server.ts` (补充 DB 迁移) | 30 |
| **P2 业务路由** | `src/routes/auth.ts` | 80 |
| | `src/routes/agents.ts` | 100 |
| | `src/routes/departments.ts` | 80 |
| | `src/routes/messages.ts` | 80 |
| | `src/routes/companies.ts` | 60 |
| | `src/routes/knowledge.ts` | 80 |
| **P3 服务层** | `src/services/agent-runner.ts` | 100 |
| | `src/services/chat.ts` | 80 |
| | `src/services/webhook.ts` | 60 |
| | `src/services/embedding.ts` | 80 |
| **P4 前端** | `ui/` 所有文件 | ~500 |
| **P5 基建** | `scripts/build.mjs` | 20 |
| | `public/index.html` | 20 |
| | **总计** | **~1700 行** |

---

## 10. 待确认决策

1. **数据库** — 用 `ctx.sql`（postgres.js）直接写 SQL，还是需要 ORM / query builder？
2. **WebSocket 消息推送** — 用 weifuwu 的 `app.ws()` + Redis Pub/Sub，还是简单轮询？
3. **前端** — 用 weifuwu/client SPA（类似 demo），还是先只提供 REST API + 命令行测试工具？
4. **前后端分离**——后端以 /dev 模式还是 build 后→serve static 模式提供 SPA 服务？
