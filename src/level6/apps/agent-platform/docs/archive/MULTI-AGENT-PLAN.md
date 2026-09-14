# Agent 协作专项计划（Multi-Agent Collaboration）

> ## ✅ 已归档（2026-12）——M1-M4 全部完成
>
> 执行记录：M1 工具定义 + 执行器（TDD 11 测试）→ M2 内置工具自动加入
> （call_agent 开箱可用）+ 浏览器端到端验收 → M3 深度防环/循环拒绝/租户隔离
> → M4 子日志落库（department_id 可空）+ 全量 90 绿。提交 `9b8ecc60`。
> 浏览器实测：A 调 B → call_agent → [数据分析师 的回复] → A 整合转述 →
> 父子两条 agent_logs（A 4634 / B 2846 tokens）。
>
> 保留本文档作为决策与实施记录。

> Wave 6-9 已形成平台底座（模板/版本/配额/审计/留存/可观测性）。
> 本计划是 P2 最后一个大项：**Agent 之间通过工具化调用协作**。
> 原则：先 TDD 后实现；诚实裁剪；真实浏览器验收。

---

## 1. 定位与目标

**核心能力**：Agent A 在对话中通过「调用 Agent B」工具，把任务委托给专业 Agent（如「数据分析师」被「开发助手」调用查数据）。

**用户价值**：
- 专业分工：每个 Agent 单一职责（客服/数据分析/开发），复杂任务由编排 Agent 调度
- 复用知识库/工具：Agent B 的知识库、文件工具对 Agent A 透明
- 审批联动：HITL 在子 Agent 上同样生效（父 Agent 等子结果）

**非目标（裁剪）**：
- 可视化 DAG 编排（拖拽）——需求未验证，先用「工具化调用」探路
- Agent 之间自由对话（消息路由）——限于「工具调用 + 结果返回」的请求-响应模式
- 并行多 Agent（fan-out）——先单调用串行，后续按需扩展

---

## 2. 架构设计：Agent 作为工具

### 2.1 模型

```
用户 → Agent A（编排/客服）
         └─ 调用工具 call_agent(agent_id, message)
              ├─ Agent B 的 Tool Loop（复用 agent-runner）
              ├─ B 的上下文 = A 的 message（+ B 自己的 system_prompt）
              └─ 结果（B 的最终回复）返回给 A → A 继续
```

### 2.2 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 调用方式 | 新工具 `call_agent`（进 Agent 的工具注册表） | 复用现有 Tool Loop——Agent 天然会"思考→调用→整合" |
| 子 Agent 上下文 | 只传 message（不含父完整对话） | 隔离上下文、防上下文膨胀；子 Agent 自带 system_prompt |
| 结果格式 | 子 Agent 最终 content（文本） | 简单可读；工具结果对 A 是字符串 |
| 深度限制 | `max_agent_depth`（默认 2） | 防 A→B→C→A 循环 |
| 权限 | 只能调用**同租户**的 ai 类型 Agent | 租户隔离 + 只调 AI（不调 user/webhook） |
| 并发 | 串行（A 等 B 结果） | 单 Agent 工具调用天然串行；并行后续扩展 |
| 错误处理 | B 失败 → 工具返回错误文本 → A 可重试/换策略 | Tool Loop 已有错误返回语义 |

### 2.3 工具定义（tools/registry.ts 扩展）

```ts
// builtin.ts 新增：
{
  function: {
    name: 'call_agent',
    description: '调用同租户的另一个 AI Agent 处理任务（传入其名称或 ID + 任务描述），返回其回复。用于专业分工：把子任务委托给擅长该领域的 Agent。',
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: '目标 Agent 名称或 ID' },
        message: { type: 'string', description: '委托给该 Agent 的任务描述' },
      },
      required: ['agent', 'message'],
    },
  },
}
```

### 2.4 执行器（agent-runner 扩展）

```
call_agent 处理器：
1. 校验：同租户 + ai 类型 + is_active + depth < max_agent_depth
2. 构造子 Agent 会话：system_prompt（B）+ 用户消息（父传入 message）
3. 调 runAgent(ctx, B, [message])——复用现有 Tool Loop
4. 返回 { ok, output: B 的最终 content }（或错误文本）
```

**复用要点**：子 Agent 的工具（文件/知识库/call_agent）全部可用——**递归协作**（B 也可调 C，深度限制防环）。

---

## 3. 数据模型

### 3.1 无需新表（工具是运行时的）

`call_agent` 是内置工具——Agent 是否可用由 `agents.tools` 决定（启用该工具 = 允许协作）。

**可选优化**（二期）：显式「协作白名单」——`agent_links` 表（from_agent → to_agent 允许列表），防 Agent 被任意调用。一期裁剪（同租户 + ai 类型即可）。

### 3.2 agent_logs 记录

子 Agent 调用在 agent_logs 留痕（steps_count/messages_count）——审计可追踪：
- 父 Agent 的日志：steps 含 call_agent
- 子 Agent 的日志：独立一条（含传入 message）

---

## 4. 实现步骤（TDD 先行）

### Step 1: 工具定义 + 注册（红→绿）
- [ ] 测试：`call_agent` 工具定义存在（name/description/parameters）
- [ ] 注册进 BUILTIN_TOOL_DEFS（tools/builtin.ts）

### Step 2: 执行器（核心——TDD）
- [ ] 测试（mock AI）：`call_agent` 处理器调用子 Agent → 返回子回复
  - 场景 1：A 调 B（B 无工具）→ 返回 B 的 content
  - 场景 2：B 失败 → 返回错误文本（A 可读）
  - 场景 3：目标不存在/非 ai 类型/异租户 → 明确错误
  - 场景 4：深度超限（A→B→C→D）→ 深度错误
  - 场景 5：B 自己调用 call_agent（递归）→ 深度递增
- [ ] 实现 `runAgent` 的工具处理器分支（agent-runner.ts）

### Step 3: 前端暴露
- [ ] AgentDetail「工具」区可选 `call_agent`（已支持 tools 编辑）
- [ ] 工具卡片显示「调用 Agent X」+ 子结果（Chat 工具卡片已支持展开）
- [ ] 测试（agent-browser 实测）：建两个 Agent → 聊天让 A 调 B → 子回复显示

### Step 4: 安全与限制
- [ ] 深度限制（max_agent_depth=2）——防环
- [ ] 超时：子 Agent 调用超时（父侧兜底）——复用现有 60s 流式超时
- [ ] 配额联动：子 Agent 调用计入其 token 配额（复用 agent_logs 月度累计）

### Step 5: 测试补强
- [ ] services.test.ts：call_agent 处理器（mock AI 链）
- [ ] 浏览器验收：端到端（父 Agent 调子 Agent 返回结果）

---

## 5. 安全边界

| 风险 | 防护 |
|---|---|
| 循环调用（A→B→A） | max_agent_depth=2（深度超限工具报错） |
| 跨租户调用 | 执行器校验 `to_agent.app_id === ctx.appId` |
| 资源消耗（子 Agent 链） | 深度限制 + 子 Agent 自身配额 + 60s 超时 |
| 任意 Agent 被调用 | 一期：同租户 ai 类型即可；二期：协作白名单 |
| 敏感信息泄漏 | 子 Agent 只收 message（不含父完整对话历史） |

---

## 6. 裁剪声明（诚实）

- **不做**：可视化编排、并行 fan-out、Agent 自由对话、跨租户协作
- **二期候选**：协作白名单（agent_links）、并行调用、子 Agent 结果结构化（JSON schema）
- **依赖**：现有 Tool Loop（agent-runner）——若工具处理器扩展与沙盒冲突需回归沙盒测试

---

## 7. 验收标准

1. `call_agent` 工具在 Agent 工具列表中可选
2. A 调 B：A 的回复整合了 B 的结果（文本可见）
3. B 有自己的 system_prompt/知识库生效（专业化）
4. 深度循环（A→B→A）被拦截（深度错误）
5. 异租户/非 ai 目标被拒绝
6. agent_logs 有父子两条记录（可审计）
7. services.test.ts + agent-browser 实测通过

## 8. 里程碑

| 阶段 | 内容 | 预计 |
|---|---|---|
| M1 | 工具定义 + 执行器（TDD） | 1 天 |
| M2 | 前端暴露 + 浏览器验收 | 0.5 天 |
| M3 | 安全/配额/超时补强 | 0.5 天 |
| M4 | 测试 + 回归 | 0.5 天 |
