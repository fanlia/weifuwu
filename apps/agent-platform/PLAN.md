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
├── server.ts                    # 应用入口 + 路由注册（含 /api/stats）
├── tsconfig.json                # paths 引用父项目 src/
├── PLAN.md                      # 本文件
│
├── src/
│   ├── ai/                      # AI 核心模块（自实现）
│   │   ├── types.ts             # 所有类型定义
│   │   ├── deepseek.ts          # DeepSeek Chat Completions 客户端
│   │   ├── dashscope.ts         # DashScope Embedding 客户端
│   │   ├── stream.ts            # SSE 流解析器
│   │   └── agent.ts             # Tool Loop 引擎 + 全局工具注册表
│   │
│   ├── middleware/
│   │   ├── ai.ts                # ctx.ai 注入（核心中间件）
│   │   ├── auth.ts              # JWT 认证 + 租户隔离
│   │   └── tenant.ts            # 从 token 提取 tenant_id
│   │
│   ├── db/
│   │   └── schema.sql           # 完整 DDL（含 agent_logs, webhook_logs）
│   │
│   ├── routes/
│   │   ├── auth.ts              # 登录/注册（scrypt 哈希 + 限流）
│   │   ├── agents.ts            # CRUD agent（4 种类型 + 内置工具列表 + token 用量统计）
│   │   ├── departments.ts       # CRUD 部门 + 成员管理
│   │   ├── messages.ts          # 发送/获取/编辑/撤回/审批
│   │   ├── companies.ts         # CRUD 公司
│   │   └── knowledge.ts         # 知识库上传/检索
│   │
│   └── services/
│       ├── agent-runner.ts      # Agent 执行编排（token 统计 + 上下文截断 + 日志记录）
│       ├── chat.ts              # 消息路由 + AI 自动回复 + HITL 审批推送
│       ├── webhook.ts           # Webhook 消息收发（签名验证 + 重试 + 日志）
│       ├── embedding.ts         # 文档分块 + 向量化 + pgvector 检索
│       ├── password.ts          # scrypt 密码哈希
│       ├── rate-limit.ts        # 内存滑动窗口限流
│       └── ws-hub.ts            # WebSocket 房间管理 + Redis Pub/Sub
│
├── ui/
│   ├── main.tsx                 # 前端入口（router + auth + ws）
│   ├── lib/api.ts               # 自动 token 刷新
│   ├── components/
│   │   ├── AppLayout.tsx        # 侧边栏布局 + 认证守卫
│   │   └── ui.tsx               # PageHeader / TypeBadge / Ava / EmptyState / Loading
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx        # 多维度统计（agent/消息/token/趋势）
│   │   ├── Agents.tsx           # 列表 + 模型/用量显示
│   │   ├── NewAgent.tsx         # 四种类型创建（含 AI 模型/温度/HITL/Token 配置）
│   │   ├── AgentDetail.tsx      # 完整编辑（AI 配置 + 工具勾选 + 执行历史/Webhook 日志/知识库 QA）
│   │   ├── Companies.tsx
│   │   ├── NewCompany.tsx
│   │   ├── Departments.tsx
│   │   ├── DepartmentDetail.tsx
│   │   ├── NewDepartment.tsx
│   │   ├── NewChat.tsx
│   │   ├── Chat.tsx             # 消息气泡 + 编辑/撤回 + HITL 审批
│   │   └── Settings.tsx
│
├── test/
│   ├── ai.test.ts               # AI 核心模块（17 tests）
│   ├── middleware.test.ts        # 中间件链（17 tests）
│   ├── services.test.ts         # 服务层（依赖 DB）
│   └── routes.test.ts           # 路由端点（依赖 DB）
│
├── scripts/
│   └── build.mjs                # esbuild 构建
│
├── seed.ts                      # 演示数据初始化
├── public/
│   └── index.html
└── .env.example
```

---

## 4. 环境变量

```env
# === 数据库 ===
DATABASE_URL=postgres://root:123456@localhost:5432/demo
# REDIS_URL=redis://localhost:6377

# === DeepSeek LLM ===
DEEPSEEK_API_KEY=sk-xxx                                  # 必需
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1             # 默认
DEEPSEEK_MODEL=deepseek-chat                              # 默认

# === DashScope Embedding ===
DASHSCOPE_API_KEY=sk-xxx                                  # 必需
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1  # 默认
DASHSCOPE_EMBEDDING_MODEL=text-embedding-v4               # 默认

# === JWT ===
JWT_SECRET=change-this-to-a-random-secret-in-production

# === 模式 ===
# NODE_ENV=production
```

---

## 5. Agent 四种类型的实现状态

| 类型 | 后端 | 前端 | 完成度 |
|------|------|------|--------|
| **AI Robot** (`ai`) | Tool Loop / Stream / HITL / Token 统计 / 上下文截断 / 执行日志 | 模型选择 / 温度滑块 / max_tokens / HITL 开关 / 工具勾选 / 执行历史面板 | **95%** |
| **Real User** (`user`) | 注册自动创建 / 消息发送 / 编辑 / 撤回 | 详情显示绑定用户 | **100%** |
| **Webhook Bot** (`webhook`) | HMAC-SHA256 签名验证 / 指数退避重试 / 调用日志 | URL / Secret / 重试次数配置 + 测试 + 请求日志面板 | **95%** |
| **Knowledge Base** (`knowledge_base`) | 文档分块 / DashScope Embedding / pgvector 检索 | 文档列表 / 上传 / 删除 / QA 检索测试 | **85%** |

---

## 6. 待办项

### P0 — 当前已实现

- [x] AI Robot: 模型选择 / 温度 / max_tokens / HITL 配置
- [x] AI Robot: 工具勾选（从内置工具列表选择）
- [x] AI Robot: 执行历史面板（次数 / token 统计）
- [x] AI Robot: token 用量统计 + 上下文截断
- [x] Webhook: Secret / 重试次数配置
- [x] Webhook: 签名验证（HMAC-SHA256）+ 指数退避重试
- [x] Webhook: 请求日志记录与展示
- [x] Dashboard: 按类型 agent 统计 / 消息数 / token 消耗 / 趋势
- [x] Agent 列表: 显示模型名 / token 用量

### P1 — 当前已实现

- [x] KB: 文件上传（拖拽 + 文件选择 .txt/.md/.csv/.json）
- [x] KB: 文档展开预览（content + chunks）
- [x] KB: 批量上传（批量 JSON 粘贴 + 多文件选择）
- [x] KB: QA 检索测试面板

### P2 — 后续改进

- [ ] Agent: 类型特定字段校验（webhook 必填 URL，KB 不需要 system_prompt）
- [ ] Agent: 统计面板（按类型、活跃度）
- [ ] 统一前端 toast 错误提示

### P2 — 长期规划

- [ ] Agent 版本管理（prompt 历史）
- [ ] Agent 模板市场
- [ ] 自定义工具注册 UI
- [ ] 多模型供应商切换
- [ ] Agent 对话导出

---

## 7. Human-in-the-Loop

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

## 8. 测试覆盖

| 测试文件 | 测试数 | 覆盖 |
|----------|--------|------|
| `test/01-auth.test.ts` | 9 | 注册/登录/me/限流/错误处理 |
| `test/ai.test.ts` | 17 | SSE / DeepSeek / DashScope / Agent Tool Loop |
| `test/middleware.test.ts` | 17 | auth / tenant / ai / 链式调用 |
| `test/services.test.ts` | 16 | agent-runner / chat / webhook / embedding (真实DB) |
| **总计** | **59** | **全通过（`node --env-file=.env --test --test-concurrency=1 'test/**/*.test.ts'`）** |
