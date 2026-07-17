# Org — 开发路线图

> 从零到可展示 MVP 的分阶段开发计划。
> 总工期预估：6-8 周（单人全职）。

---

## 总体阶段划分

```
Phase 0 — 基础设施搭建         ██░░░░░░  1 周
Phase 1 — 核心数据模型 + API   ██████░░  2 周
Phase 2 — 前端界面 + 交互      ████████  2 周
Phase 3 — AI Agent 集成       ████████  1.5 周
Phase 4 — 知识库 + RAG        █████████  1.5 周
Phase 5 — 打磨 + 部署          █████████  1 周
                              ────────
                              总计 ~9 周
```

每个 Phase 结束时都有**可演示的增量**，不等到全部做完才看到效果。

---

## Phase 0 — 基础设施搭建（第 1 周）

**目标：** 能跑起一个空的 Org 页面，确认开发环境通畅。

| 任务 | 细节 | 依赖 |
|------|------|------|
| 0.1 初始化数据库 schema | 创建 `tenants`、`companies`、`departments`、`agents` 四张表的 migration | — |
| 0.2 编写 `org()` 中间件骨架 | 空的中间件工厂，注入 `ctx.org`，声明 Context 扩展 | — |
| 0.3 docker compose 确认 | weifuwu 已有的 `docker-compose.yml`（postgres + redis）确认可用 | — |
| 0.4 确认 demo 能运行 | `node apps/org/server.ts` 能启动，浏览器能打开页面 | 0.1-0.3 |
| 0.5 前端构建脚本 | 确认 `scripts/build.mjs` 能编译 TSX → JS | — |

**产出：** `http://localhost:3001` 能打开 Org 页面，左侧侧边栏空白，路由可跳转。

---

## Phase 1 — 核心数据模型 + RESTful API（第 2-3 周）

**目标：** 完整实现 Tenant → Company → Department → Agent 的 CRUD API。

### 1.1 数据模型设计（先文档，后代码）

```typescript
// ── tenants 表 ──
interface Tenant {
  id: string        // UUID v7
  name: string
  slug: string      // 唯一，用于路由 / 子域名
  config: {         // JSONB
    apiKey?: string
    model?: string
    embeddingModel?: string
  }
  created_at: Date
  updated_at: Date
}

// ── companies 表 ──
interface Company {
  id: string
  tenant_id: string    // FK → tenants
  name: string
  created_at: Date
  updated_at: Date
}

// ── departments 表 ──
interface Department {
  id: string
  company_id: string   // FK → companies
  name: string
  description?: string
  avatar?: string
  conversation_id: string  // FK → messager conversations
  created_at: Date
  updated_at: Date
}

// ── department_agents 表（多对多） ──
interface DepartmentAgent {
  department_id: string
  agent_id: string
  role: 'member' | 'admin'
  alias?: string       // 在部门里的昵称/@名
  joined_at: Date
}

// ── agents 表 ──
type AgentKind = 'ai' | 'user' | 'webhook' | 'knowledge'

interface Agent {
  id: string
  kind: AgentKind
  name: string
  avatar?: string
  // 如果是 'user' 类型
  user_id?: string     // FK → users
  // 如果是 'ai' 类型
  ai_config?: {        // JSONB
    systemPrompt: string
    temperature: number
    maxTokens: number
    tools: string[]
    hitl: boolean
  }
  // 如果是 'webhook' 类型
  webhook_url?: string
  // 如果是 'knowledge' 类型
  kb_id?: string       // FK → kb_documents?
  created_at: Date
  updated_at: Date
}
```

### 1.2 RESTful API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/tenants` | 列出所有 tenant |
| `POST` | `/api/tenants` | 创建 tenant |
| `GET` | `/api/tenants/:id` | 获取 tenant 详情 |
| `PUT` | `/api/tenants/:id` | 更新 tenant |
| `DELETE` | `/api/tenants/:id` | 删除 tenant |
| `GET` | `/api/tenants/:tid/companies` | 列出 tenant 下所有公司 |
| `POST` | `/api/tenants/:tid/companies` | 创建公司 |
| `GET` | `/api/companies/:id` | 公司详情 |
| `PUT` | `/api/companies/:id` | 更新公司 |
| `DELETE` | `/api/companies/:id` | 删除公司 |
| `GET` | `/api/companies/:cid/departments` | 列出公司下所有部门 |
| `POST` | `/api/companies/:cid/departments` | 创建部门（自动创建 messager conversation）|
| `GET` | `/api/departments/:id` | 部门详情（含 Agent 列表）|
| `PUT` | `/api/departments/:id` | 更新部门 |
| `DELETE` | `/api/departments/:id` | 删除部门 |
| `GET` | `/api/departments/:did/agents` | 列出部门成员 |
| `POST` | `/api/departments/:did/agents` | 添加 Agent 到部门 |
| `DELETE` | `/api/departments/:did/agents/:aid` | 从部门移除 Agent |
| `GET` | `/api/agents` | 列出所有 Agent（全局）|
| `POST` | `/api/agents` | 创建 Agent |
| `GET` | `/api/agents/:id` | Agent 详情 |
| `PUT` | `/api/agents/:id` | 更新 Agent |
| `DELETE` | `/api/agents/:id` | 删除 Agent |

### 1.3 关键逻辑

- 创建 Department 时，自动调用 `ctx.messager.createGroupConversation()` 创建对应的聊天会话，把 `conversation_id` 存入 department 记录
- 向 Department 添加 AI Agent 成员时，自动注册 Agent 进入对应 conversation 的参与者列表
- Tenant 隔离：所有 query 自动加上 `WHERE tenant_id = ctx.tenant.id` 条件

### 1.4 `org()` 中间件设计

```typescript
// 注入 ctx.org
interface OrgAPI {
  // Tenant
  createTenant(input): Promise<Tenant>
  listTenants(): Promise<Tenant[]>
  getTenant(id): Promise<Tenant | null>
  updateTenant(id, input): Promise<Tenant | null>
  deleteTenant(id): Promise<boolean>

  // Company
  createCompany(tenantId, input): Promise<Company>
  listCompanies(tenantId): Promise<Company[]>
  getCompany(id): Promise<Company | null>
  updateCompany(id, input): Promise<Company | null>
  deleteCompany(id): Promise<boolean>

  // Department
  createDepartment(companyId, input): Promise<Department>
  listDepartments(companyId): Promise<Department[]>
  getDepartment(id): Promise<Department | null>
  updateDepartment(id, input): Promise<Department | null>
  deleteDepartment(id): Promise<boolean>

  // Agent
  createAgent(input): Promise<Agent>
  getAgent(id): Promise<Agent | null>
  updateAgent(id, input): Promise<Agent | null>
  deleteAgent(id): Promise<boolean>

  // Department-Agent binding
  addAgentToDepartment(deptId, agentId, role): Promise<void>
  removeAgentFromDepartment(deptId, agentId): Promise<boolean>
  listDepartmentAgents(deptId): Promise<Agent[]>
}
```

**产出：** 可以用 curl / 浏览器测试所有 API，后端数据持久化到 postgres。

---

## Phase 2 — 前端界面 + 交互（第 4-5 周）

**目标：** 完整的 SPA 体验——左侧组织树、页面路由、CRUD 表单。

### 2.1 页面清单

```
/                                          — 租户列表（首页）
/tenant/:tenantId                         — 租户详情 → 公司列表
/tenant/:tenantId/company/:companyId      — 公司详情 → 部门列表
/tenant/:tenantId/company/:companyId/dept/:deptId  — 部门聊天室
/settings                                 — 设置页（创建租户 / 管理 Agent）
```

### 2.2 组件分解

| 组件 | 说明 | 状态管理 |
|------|------|---------|
| `OrgTree` | 左侧组织树：tenant → company → department 三级展开 | `signal<TreeNode[]>` |
| `TenantList` | 首页租户卡片列表 | `signal<Tenant[]>` |
| `TenantDetail` | 租户设置 + 公司列表 | `signal<Company[]>` |
| `CompanyDetail` | 公司设置 + 部门列表 | `signal<Department[]>` |
| `DepartmentChat` | 部门聊天主界面 | `signal<Message[]>` |
| `MessageList` | 消息列表 + 自动滚动 | `signal<Message[]>` |
| `ChatInput` | 输入框 + @Agent 提及 | `signal<string>` |
| `AgentList` | 部门成员侧边栏 | `signal<Agent[]>` |
| `CreateModal` | 通用创建弹窗（租户/公司/部门/Agent） | — |

### 2.3 关键交互

- **@Agent 提及** — 输入 `@` 弹出 Agent 列表，选择一个后发送给对应 Agent
- **消息流式渲染** — AI Agent 回复时，消息框逐步显示文本（SSE）
- **组织树展开/收起** — 三级树形控件，点击节点跳转路由
- **未读消息标记** — 部门列表显示未读计数
- **拖拽调整侧边栏宽度** — 便利功能

### 2.4 样式目标

- Slack-like 三栏布局：组织树（窄）| Agent 列表 | 聊天主区域
- 或者 Discord-like 两栏：组织树 + 聊天主区域
- 使用 Tailwind（已在 weifuwu 生态中）

**产出：** 完整的 SPA 体验，能创建/浏览/删除组织层级，能在部门里发消息。

---

## Phase 3 — AI Agent 集成（第 6 周）

**目标：** 部门里的 AI Agent 能对话、能检索知识库、能调用工具。

### 3.1 AI Agent 创建流程

- 创建 Agent 时选 `kind: 'ai'`
- 配置 system prompt、temperature、maxTokens
- 选择可用工具列表（内置工具 + 自定义工具）
- 选择是否启用 human-in-the-loop
- 绑定到部门

### 3.2 对话流程

```
用户在部门聊天中 @AI 机器人 并发送消息
  → 前端通过 WebSocket 发送消息
  → 后端检测 @提及，识别目标 Agent
  → 调用 ctx.agent.chatStreamResponse({
      messages: [...历史消息, { role: 'user', content }],
      system: Agent 的 systemPrompt,
    })
  → SSE 流式返回 → 前端逐步渲染
  → 消息存入 messager 的 messages 表
```

### 3.3 Human-in-the-loop

- AI Agent 在需要执行"高风险操作"（发邮件、调外部 API、修改数据）时，先发送一条待审批消息
- 审批消息在聊天里显示为"待审批"卡片，带有"同意"/"拒绝"按钮
- 主管点击同意 → Agent 继续执行 → 结果发回聊天
- 主管点击拒绝 → Agent 回复"已取消"

### 3.4 支持的工具

| 工具 | 说明 |
|------|------|
| `search_knowledge` | 搜索部门绑定的知识库 |
| `get_weather` | 示例工具（演示用）|
| `send_email` | 发送邮件（需要 HITL）|
| `list_department_members` | 列出部门成员 |
| `get_department_info` | 获取部门信息 |

**产出：** 能在部门聊天里 @AI 机器人并获得流式回答，AI 能检索知识库、能请求审批。

---

## Phase 4 — 知识库 + RAG（第 7 周）

**目标：** 部门可以导入文档，AI Agent 自动检索相关内容增强回答。

### 4.1 知识库绑定

- 每个 Department 可以绑定 0-N 个知识库
- 知识库本质是 `kb()` 的文档集合，但按 department_id 做隔离
- 新建 `kb_departments` 关联表

### 4.2 文档导入

| 方式 | 说明 |
|------|------|
| 直接粘贴文本 | 简单场景，从聊天界面粘贴 |
| 上传文件 | 支持 .md / .txt / .pdf（第一版只做 .md + .txt）|
| Web 导入 | 输入 URL，抓取内容后导入 |
| 聊天消息沉淀 | 用户可手动将聊天消息"加入知识库" |

### 4.3 RAG 集成到 Agent

```typescript
// 在 agent() 的 knowledge.search 中：
search: async (query, ctx) => {
  // 1. 从 ctx 中获取当前部门绑定的知识库 ID
  // 2. 调用 ctx.kb.search(query, { filter: { department_id } })
  // 3. 返回 topK 个结果
  const deptId = ctx.department.id
  const results = await ctx.kb.search(query, {
    filter: { department_id: deptId },
    limit: 3,
    minScore: 0.5,
  })
  return results.map(r => ({ content: r.content, score: r.score }))
}
```

### 4.4 知识库管理页面

- `/tenant/:tid/kb` — 知识库列表
- 导入文档的 UI（粘贴 / 上传）
- 文档列表 + 检索测试（输入 query 看召回结果）

**产出：** 导入文档 → AI 对话时自动检索 → 回答带引用。

---

## Phase 5 — 打磨 + 部署（第 8 周）

**目标：** 能对外展示、能部署到生产环境。

### 5.1 体验打磨

| 任务 | 说明 |
|------|------|
| 消息已读/未读 | 标记用户最后阅读时间 |
| 在线状态 | WebSocket 心跳，显示谁在线 |
| 消息时间分组 | 今天/昨天/更早 |
| 消息搜索 | 全文搜索历史消息 |
| 错误处理 | API 错误提示、网络断线重连 |
| 加载状态 | skeleton loading、spinner |

### 5.2 起手体验（Onboarding）

- 首次打开 → 引导创建第一个 Tenant
- 创建 Tenant → 引导创建第一个 Company
- 创建 Company → 引导创建第一个 Department
- 创建 Department → 引导添加第一个 Agent（AI 机器人或邀请用户）
- 进入聊天 → "试试 @AI 机器人 问一个问题"

### 5.3 部署文档

- `DEPLOY.md` — 部署到生产环境的步骤
- 环境变量清单
- Docker 镜像构建
- 反向代理配置（nginx / Caddy）

### 5.4 测试

| 类型 | 覆盖 |
|------|------|
| API 测试 | `node --test` 覆盖所有 CRUD 端点 |
| 前端组件测试 | 组件纯函数调用，断言返回的 Node |
| E2E 测试 | 核心流程：创建 tenant → 创建 company → 发消息 |

---

## 里程碑总览

| 里程碑 | 时间 | 可演示内容 |
|--------|------|-----------|
| **M0** 环境跑通 | Week 1 | `localhost:3001` 显示 Org 页面 |
| **M1** API 就绪 | Week 3 | curl 可完成 Tenant/Company/Department/Agent 全部 CRUD |
| **M2** 前端可用 | Week 5 | 在浏览器里创建组织层级、在部门里发消息 |
| **M3** AI 能对话 | Week 6 | 部门聊天里 @AI 机器人获得流式回答 |
| **M4** 知识库上线 | Week 7 | 导入文档 → AI 自动检索 → 带引用回答 |
| **M5** 可部署 | Week 8 | 完整产品，可展示、可部署 |

---

## 技术债务与后续

**第一版不做的（但有计划）：**
- 文件/图片上传（仅文本消息）
- 消息编辑/撤回
- 已读回执
- 消息搜索
- 通知推送
- OAuth / SSO 登录
- 多语言
- 移动端

**第一版之后可能的扩展：**
- Agent 市场（可安装预配置的 AI Agent）
- 工作流引擎（多个 Agent 协作完成一个任务）
- 仪表盘（AI 使用量统计）
- OpenAI / Claude / 其他模型支持
- 语音消息

---

## 每日开发节奏建议

```
早上：写核心逻辑（中间件、API、数据层）
下午：写前端（组件、交互、样式）
晚上：跑通端到端流程 + 修 bug
```

每个 Phase 结束时做一次 **dogfooding**：自己用这个产品完成一个真实任务（比如创建一个新租户、加一个 Agent、问一个问题），确保可用。
