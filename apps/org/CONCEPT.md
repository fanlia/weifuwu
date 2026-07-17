# Org — Enterprise AI Collaboration Platform

> 一个基于 weifuwu 构建的企业级 AI 协作平台。
> Tenant → Company → Department → Agent，让人和 AI 在同一组织架构下协同工作。

---

## 核心理念

### 五层模型

```
Tenant（租户）
  ├── 独立部署 / 独立数据空间
  ├── 独立 API Key（DeepSeek / 其他 LLM）
  ├── 独立的知识库与 embedding 模型
  │
  └── Company（公司）
       ├── 部门结构的根节点
       ├── 多个 Department
       │
       └── Department（部门 / 群组）
            ├── 基于 messager 的实时聊天组
            ├── 成员为 Agent
            ├── 支持单聊（1对1）和群聊（N对N）
            │
            └── Agent（成员）
                 ├── AI 机器人  ← agent() + kb()
                 ├── 真实用户   ← user()
                 ├── Webhook   ← HTTP Webhook 收发消息
                 └── 知识库     ← kb() 语义检索（PGVector）
```

### 设计原则

1. **Agent 是一等公民** — 在 Org 中，AI 机器人和真人用户都是 Department 的"成员"，享有同样的消息收发、@提及、文件共享能力。Agent 通过 `agent()` 中间件驱动，支持：
   - DeepSeek 模型推理
   - Human-in-the-loop（关键操作等待人确认）
   - Tool calling（调用内部 API 或外部服务）
   - RAG 知识检索（接入 `kb()` 模块）

2. **多租户隔离** — 每个 Tenant 完全独立：
   - 数据库 schema 级隔离（`tenant_*` 表前缀或独立 database）
   - 独立的 LLM 配置（API Key、model、temperature）
   - 独立的知识库向量空间
   - 独立的用户体系

3. **实时协作优先** — 基于 `messager()` + WebSocket：
   - 消息实时推送
   - 在线状态感知
   - AI Agent 流式响应（SSE）
   - 消息编辑 / 撤回 / 已读回执

4. **知识即基础设施** — 知识库不再是"外挂"，而是 Department 的原生能力：
   - 每个 Department 可以绑定一个知识库
   - AI Agent 自动检索相关文档注入上下文
   - 知识库支持多格式导入（Markdown, PDF, 网页）

---

## 模块依赖链

```
postgres()        — 所有关系数据 + pgvector
  └── user()      — 用户注册 / 登录 / JWT
       └── org()  — Org 核心中间件（Tenant / Company / Department CRUD）
            ├── messager()  — 实时消息 + 会话管理
            ├── agent()     — AI Agent 推理 / 工具 / HITL
            └── kb()        — 知识库语义检索
```

---

## 数据模型（初步）

```typescript
// ── Tenant ──
interface Tenant {
  id: string
  name: string
  slug: string              // 唯一标识，用于子域名
  config: {
    apiKey?: string         // LLM API Key
    model?: string          // 默认模型
    embeddingModel?: string // 默认 embedding 模型
  }
  created_at: Date
  updated_at: Date
}

// ── Company ──
interface Company {
  id: string
  tenant_id: string
  name: string
  created_at: Date
  updated_at: Date
}

// ── Department ──
interface Department {
  id: string
  company_id: string
  name: string
  description?: string
  avatar?: string
  created_at: Date
  updated_at: Date
}

// ── Agent（成员） ──
// Agent 类型：union of different kinds
type AgentKind = 'ai' | 'user' | 'webhook' | 'knowledge'

interface Agent {
  id: string
  department_id: string
  kind: AgentKind
  // 如果是 'user' 类型，绑定到 user 表
  user_id?: string
  // 如果是 'ai' 类型
  ai_config?: {
    systemPrompt: string
    temperature: number
    maxTokens: number
    tools: string[]          // 可用工具列表
    hitl: boolean            // 是否启用 human-in-the-loop
  }
  // 如果是 'webhook' 类型
  webhook_url?: string
  // 如果是 'knowledge' 类型
  knowledge_base_id?: string
  created_at: Date
  updated_at: Date
}
```

---

## 第一版范围（MVP）

| 功能 | 说明 |
|------|------|
| Tenant CRUD | 创建 / 管理租户 |
| Company CRUD | 在租户下创建公司 |
| Department CRUD | 在公司下创建部门 |
| Agent 管理 | 添加/移除部门成员（AI / 真人 / Webhook） |
| 部门聊天 | 基于 messager 的实时群聊 |
| AI Agent 对话 | 在部门里 @AI 机器人，获得推理回复 |
| 基础知识库 | 部门级知识库，RAG 注入 AI 对话 |
| 多租户隔离 | 不同 Tenant 数据不互通 |

---

## 技术架构

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  前端 SPA    │────▶│  后端 Server  │────▶│  Postgres │
│ (weifuwu     │     │ (weifuwu     │     │ + pgvector│
│  /client)    │◀────│  Router)     │◀────│           │
└─────────────┘     │              │     └───────────┘
       │             │  WebSocket   │
       │             │  (messager)  │
       └─────────────┤              │
                     │  SSE Stream  │
                     │  (agent)     │
                     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │  DeepSeek  │
                     │  API       │
                     └───────────┘
```

---

## 和 weifuwu 现有模块的对应

| Org 概念         | weifuwu 模块          | 说明                              |
|-----------------|----------------------|-----------------------------------|
| Tenant          | 新增 `org()` 中间件   | 多租户管理的核心                    |
| Company         | 新增 `org()` 中间件   | Company CRUD                      |
| Department      | `messager()`         | 复用 conversation 机制             |
| Agent (AI)      | `agent()` + `kb()`   | AI 机器人直接复用                   |
| Agent (User)    | `user()`             | 用户复用现有认证体系                 |
| Agent (Webhook) | 新增 webhook handler | 简单 HTTP 回调                     |
| Agent (知识库)   | `kb()`               | 复用 PGVector 语义检索              |
| 消息             | `messager()`         | 已有完整的消息系统                   |
| 实时通信          | 内置 WebSocket       | 复用 ws handler                    |

---

## 目录结构（规划）

```
apps/org/
├── CONCEPT.md          # 本文件 — 理念文档
├── server.ts           # 后端入口
├── src/
│   └── main.tsx        # 前端 SPA
├── public/
│   ├── index.html      # HTML 模板
│   └── style.css        # 样式
├── scripts/
│   └── build.mjs       # 构建脚本
├── tsconfig.json       # TypeScript 配置
└── dist/               # 构建产物
```
