# Weifuwu AI Stream Protocol (v1)

> **weifuwu 前后端之间的 LLM/agent 对话协议。** 定义"后端如何把一次对话/一次 agent run 流式地告诉前端，前端如何回传人工决策"。
>
> - **协议是 weifuwu 自己的**（`wf:` 命名空间），不依赖任何 provider 的 wire format——前端只见 `wf:` 事件，换模型/换提供商前端零改动。
> - **实现可换**：后端可以用自研 OpenAI 兼容客户端（`weifuwu/src/ai/`）、raw fetch 或任何库，只要输出 `wf:` 事件即可。协议不绑定实现。
> - **错误即值**：`wf:error` 是正常协议消息，不是断流异常（对齐自研 DB 客户端 RESP `-ERR` 精神）。
> - **前端参考实现**（`weifuwu/client`）：`aiStream()` = 传输解码（POST + SSE 解析 + trace + abort）；`ctx.ui.useChat()` = 会话语义层（消息累积、工具调用内嵌、HITL 审批、stop/retry，协议对页面透明）。
> - **版本**：本文档为 v1。非破坏性演进（新事件）直接追加；破坏性变更升版本号，两端随 weifuwu 单包原子发布同步升级。

---

## 1. 传输

### 1.1 下行：SSE（`text/event-stream`）

- 一次 `POST` = 一次对话 / 一次 agent run
- 请求头：`Accept: text/event-stream`；认证与业务参数走 app 的既有中间件（auth / rateLimit 等）
- 响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`
- 事件格式：`event: <名称>\ndata: <JSON>\n\n`

```
event: wf:message_start
data: {"id":"9f3a"}

event: wf:token
data: {"text":"你好"}

event: wf:done
data: {"content":"你好，有什么可以帮你？","usage":{"prompt_tokens":512,"completion_tokens":384}}
```

调试：`curl -N -X POST <url> -d '{"messages":[...]}'` 直接看裸事件。

### 1.2 上行：独立 POST

SSE 单向，人工决策回传走独立 POST（低频、可鉴权、可审计）：

```
POST /api/ai/approve
Content-Type: application/json

{"id":"ap_01","decision":"approved","note":"OK"}
```

- 回传载荷形状由协议定义（见 §4.5）；**路由路径是 app 的**（app 知道自己的 run 生命周期）。
- 回传端点应挂 auth / rateLimit，审批记录带 `ctx.user` 进审计。

### 1.3 生命周期

| 语义 | 规则 |
|---|---|
| 请求即会话 | 一次 POST + 一条 SSE 连接 = 一个会话；无连接池、无会话管理 |
| 断开 = abort | 客户端断开 → `req.signal` → 取消 provider 请求（省 token） |
| 无 token 超时 | 60s 内无任何事件 → `wf:error { code: 'timeout' }`，随后关闭连接 |
| 审批超时 | `wf:approval_request.expiresAt` 到期无人批 → 工具以 `tool_result { error: { code: 'timeout' } }` 结束（见 §4.5） |

---

## 2. 事件集总表

| 事件 | 层 | 方向 | 前端处理 | v1 状态 |
|---|---|---|---|---|
| `wf:message_start` | 核心 | 下行 | 创建会话/消息 | ✅ 实现 |
| `wf:token` | 核心 | 下行 | **append** 文本 | ✅ 实现 |
| `wf:usage` | 核心 | 下行 | 更新 token 计数 | ✅ 实现 |
| `wf:done` | 核心 | 下行 | 收尾（内容 + usage） | ✅ 实现 |
| `wf:error` | 核心 | 下行 | 结构化降级（重试/提示） | ✅ 实现 |
| `wf:tool_call` | 工具 | 下行 | 渲染工具卡片 | ✅ 实现 |
| `wf:tool_result` | 工具 | 下行 | 卡片 → 结果态 | ✅ 实现 |
| `wf:tool_progress` | 工具 | 下行 | 卡片 → 进度态 | ✅ 实现 |
| `wf:step` | agent | 下行 | 步骤可视化 | ✅ 实现（agent 引擎） |
| `wf:approval_request` | agent | 下行 | 渲染审批卡片（待批态） | ✅ 实现（agent 引擎） |
| `wf:approval_response` | agent | **上行 POST** | 用户决策回传 | ✅ 实现（ctx.ai.approve） |
| `x:*` | 自定义 | 双向 | **透传不解释** | ✅ 规则生效 |

**层规则**：只要 chat 的 app 永远不接触工具/agent 事件；前端解码器按层订阅，未订阅的事件跳过不报错。

---

## 3. 核心事件（chat 必需）

### 3.1 `wf:message_start`

```jsonc
{ "id": "9f3a" }            // 会话/消息 id
```

- 一条 SSE 流的第一个事件。
- **`id` 应取 `X-Trace-Id` 请求头**（见 §7 追踪关联），无则后端生成。
- 前端以 `id` 关联后续所有事件。

### 3.2 `wf:token`

```jsonc
{ "text": "你好" }          // 增量文本，直接 append
```

- **纯增量**：前端把 `text` 追加到当前消息尾部，不做 diff/合并。
- 一个 provider chunk 的 content delta → 一个 `wf:token`（后端不做聚合）。

### 3.3 `wf:usage`

```jsonc
{ "prompt_tokens": 512, "completion_tokens": 384 }
```

- provider 返回 usage 时即发（可能出现在流中最后一 chunk，或聚合后一次发）。
- 前端只更新计数，不改变消息内容。

### 3.4 `wf:done`

```jsonc
{
  "content": "你好，有什么可以帮你？",
  "usage": { "prompt_tokens": 512, "completion_tokens": 384 }
}
```

- 正常收尾事件：完整内容 + 最终 usage。
- 前端标记会话完成（停止打字指示、启用输入框）。

### 3.5 `wf:error`

```jsonc
{ "code": "rate_limited", "message": "请求过于频繁，请稍后再试" }
```

- **正常协议消息，连接保持**（除非 code 为致命错误如 `auth_failed`，后端可随后关闭）。
- 前端按 `code` 分类降级：展示错误、给重试按钮、允许继续会话。

**错误码表（v1 定稿）**：

| code | 含义 | 前端建议 |
|---|---|---|
| `auth_failed` | API key 无效/未配置 | 引导配置 |
| `rate_limited` | provider 限流 | 显示 + 延迟重试 |
| `context_length` | 上下文超长 | 提示截断/新会话 |
| `timeout` | 无 token 超时 / 审批超时 | 提示重试 |
| `provider_error` | provider 返回错误（详情在 message） | 显示 message |
| `invalid_request` | 请求参数错误 | 修复请求 |
| `unsupported` | 能力不支持（诚实裁剪，CS-05） | 提示不可用 |
| `aborted` | 服务端侧主动取消 | 静默 |

---

## 4. 工具事件（chat + tools）

### 4.1 `wf:tool_call`

```jsonc
{
  "id": "tc_01",               // 工具调用 id（provider 给 / 后端生成）
  "name": "query_orders",      // 工具名（app 定义的业务语义，协议不解释）
  "args": { "userId": "u1" }   // 完整参数
}
```

- **后端聚合完成后才发出**：provider 流式 chunk 中 `tool_calls` 的 id 可能只在首个 chunk（DeepSeek 如此），后端负责聚合出完整的 `{ id, name, args }` 再发。前端不接触增量。
- 并行工具调用 = 连续多条 `wf:tool_call`（各带独立 id），前端可渲染多张卡片。
- 前端按 `name` 分发渲染（`SearchCard` / `ProgressBar` / …），工具名是 app 的扩展面。

### 4.2 `wf:tool_result`

```jsonc
{ "id": "tc_01", "ok": true, "output": { "rows": 3 } }
```

失败形态：

```jsonc
{ "id": "tc_01", "ok": false, "error": { "code": "rejected", "message": "预算不够" } }
```

- `error.code`：`rejected`（人工拒绝）/ `timeout`（审批超时）/ `tool_error`（执行异常）/ app 自定义。
- **`ok: false` 不代表对话结束**——agent 读到 result 后可换方案重试（HITL 核心语义）。

### 4.3 `wf:tool_progress`

```jsonc
{
  "toolCallId": "tc_01",
  "step": 2,
  "total": 5,
  "message": "生成第 2 页",
  "status": "running"          // running | error | done
}
```

- 长任务（PPT 生成、委派子 agent、深度搜索）执行期间的进度汇报，前端更新卡片进度条。
- 秒级任务用此事件；分钟级任务应入队（`ctx.queue`）+ 独立进度通道，见 §9。

### 4.4 工具执行模型

```ts
// 工具 = 普通对象；run 收到 emit（汇报进度/自定义事件）与 signal（取消）
tools: [{
  name: 'generate_ppt',
  run: async (args, { emit, signal }) => {
    emit('wf:tool_progress', { step: 1, total: 5, message: '生成大纲' })
    emit('x:ppt_page_done', { page: 2 })          // 自定义事件
    return { fileId: 'ppt_01' }                    // → wf:tool_result
  }
}]
```

- `emit` 是工具的执行声道：可发 `wf:tool_progress` 与任意 `x:*` 事件。
- `signal`：用户取消 → abort → 中断长任务（与 §1.3 生命周期闭环）。
- 工具名/args 语义是 app 的，协议只定义"调用怎么流动"。

### 4.5 人工审批（HITL，agent 扩展 schema）

**下行** `wf:approval_request`：

```jsonc
{
  "id": "ap_01",
  "toolCallId": "tc_02",
  "name": "send_email",
  "args": { "to": "boss@x.com", "subject": "方案" },
  "reason": "发送前需要确认收件人",
  "expiresAt": 1735689600000     // 审批超时
}
```

发出后**后端挂起该工具执行**，等待上行回传。

**上行** `POST`（`wf:approval_response` 载荷）：

```jsonc
{
  "id": "ap_01",
  "decision": "approved",        // approved | rejected | modified
  "modifiedArgs": { "to": "me@x.com" },   // 仅 modified
  "note": "不要群发，只发给我"
}
```

**决策语义**：

| decision | 工具行为 | 后续事件 |
|---|---|---|
| `approved` | 按原 args 执行 | `wf:tool_result` |
| `modified` | 按 `modifiedArgs` 执行 | `wf:tool_result` |
| `rejected` | 不执行 | `wf:tool_result { ok:false, error:{ code:'rejected', message: note } }` → **agent 读 reason 换方案** |

- 审批请求带独立 `id`：并发多卡片各自挂起/恢复；id 一次性（防重放）。
- 回传端点挂 auth + rateLimit，审批人 `ctx.user` 进审计（app 责任，协议给 id 语义）。
- 超时：`expiresAt` 到期 → 按 rejected 处理（`error.code: 'timeout'`）。

---

## 5. agent 扩展事件（已实现：src/ai/agent.ts）

### 5.1 `wf:step`

```jsonc
{ "type": "llm", "content": "正在查询订单…" }
{ "type": "tool", "toolCallId": "tc_01", "name": "query_orders" }
```

- 供前端做步骤可视化（思考中/工具执行中/完成）。
- 由 agent 引擎（`a.agent()`）在每个 LLM 轮次前与每个工具执行前发出。

### 5.2 agent 引擎（`a.agent({ systemPrompt, tools, humanInTheLoop })`）

工具循环：LLM 流式（emit `wf:token`）→ tool_calls → 执行工具 → 结果回喂 → 重复，直到无工具调用或 maxSteps 耗尽。

- 事件序列：`message_start → (step:llm → token* → tool_call → step:tool → [approval_request → approve] → tool_result)* → usage → done`
- **工具执行上下文**：`run(args, { emit, signal })`——emit `wf:tool_progress` / `x:*` 自定义事件；signal 接收用户取消
- **HITL 审批**：`humanInTheLoop` 时每个工具执行前挂起等 `ctx.ai.approve()` 响应（见 §4.5）
- **多轮消息纪律**（真实 DeepSeek 验证）：带 tool_calls 的 assistant 消息必须入上下文；thinking 模式 `reasoning_content` 必须回传（陷阱清单 #4）

### 5.3 子 agent = 工具

多 agent 沟通不新增协议事件：子 agent 通过 `delegate` 工具承载（工具 run 内调 `a.chat()` 或另一个 agent 的循环），其最终输出 = 该工具的 `tool_result`。编排逻辑（委派给谁、何时、如何聚合）是 app 在工具 handler 里的业务。

---

## 6. 扩展机制（协议不是紧身衣）

| 机制 | 规则 |
|---|---|
| `x:` 命名空间 | `event: x:any_name`，解码器**透传不解释、不校验、不转换**，前端经 `onEvent` 自处理 |
| 未知字段透传 | `data` 中未知字段必须原样保留（解码器不得丢弃）——新旧客户端双向兼容 |
| 未知事件 | 前端**不得抛错**：未订阅的事件跳过（老前端接新后端安全） |
| 晋升路径 | 2+ app 收敛的 `x:` 事件 → 晋升为 `wf:` 事件 + 协议版本小升 + 前端原语跟进，单包原子发布 |

**规则一句话：`wf:` 是框架的、版本化的、有前端原语覆盖的；其余全是 app 的。**

---

## 7. 追踪关联（trace）

- 前端流式请求应携带 `X-Trace-Id` 请求头（ctx.api 同源生成，一行钩子）。
- 后端以 `X-Trace-Id` 作为 `wf:message_start.id`（serve.ts 已内置 traceId 机制，接受 `x-trace-id` / `traceparent`，兜底 `randomUUID`，响应头回显）。
- **工具内发起的后端请求继承同一 traceId** → 整个 agent run（对话 + provider 调用 + 工具内请求）挂在同一 id 下，日志一次搜完。

```
用户输入 → POST /api/chat (X-Trace-Id: 9f3a)
        → wf:message_start { id: "9f3a" }
        → provider 调用（日志带 9f3a）
        → wf:tool_call query_orders
          → GET /api/orders（继承 X-Trace-Id: 9f3a）
        → wf:done
→ 日志搜 "9f3a" = 整个会话全链路
```

---

## 8. 共享类型（规范型，`src/ai/types.ts` 据此实现）

```ts
// ── 事件 ──────────────────────────────────────────────

export interface WfMessageStart { id: string }
export interface WfToken { text: string }
export interface WfUsage { prompt_tokens: number; completion_tokens: number; total_tokens?: number }
export interface WfDone { content: string; usage?: WfUsage }

export type WfErrorCode =
  | 'auth_failed' | 'rate_limited' | 'context_length' | 'timeout'
  | 'provider_error' | 'invalid_request' | 'unsupported' | 'aborted'

export interface WfError { code: WfErrorCode; message: string }

export interface WfToolCall { id: string; name: string; args: Record<string, unknown> }
export interface WfToolResult {
  id: string
  ok: boolean
  output?: unknown
  error?: { code: string; message: string }   // rejected | timeout | tool_error | app 自定义
}
export interface WfToolProgress {
  toolCallId: string
  step: number
  total: number
  message?: string
  status: 'running' | 'error' | 'done'
}

export interface WfStep { type: 'llm' | 'tool'; content?: string; toolCallId?: string; name?: string }
export interface WfApprovalRequest {
  id: string
  toolCallId: string
  name: string
  args: Record<string, unknown>
  reason?: string
  expiresAt?: number
}
export type WfApprovalDecision = 'approved' | 'rejected' | 'modified'
export interface WfApprovalResponse {
  id: string
  decision: WfApprovalDecision
  modifiedArgs?: Record<string, unknown>
  note?: string
}

/** 所有框架事件的联合类型（前端 switch 收窄用） */
export type WfStreamEvent =
  | { name: 'wf:message_start'; data: WfMessageStart }
  | { name: 'wf:token'; data: WfToken }
  | { name: 'wf:usage'; data: WfUsage }
  | { name: 'wf:done'; data: WfDone }
  | { name: 'wf:error'; data: WfError }
  | { name: 'wf:tool_call'; data: WfToolCall }
  | { name: 'wf:tool_result'; data: WfToolResult }
  | { name: 'wf:tool_progress'; data: WfToolProgress }
  | { name: 'wf:step'; data: WfStep }
  | { name: 'wf:approval_request'; data: WfApprovalRequest }

// ── 对话消息（回传 provider 的形状，与 wf: 事件无关）────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'
export interface ChatMessage {
  role: MessageRole
  content: string
  /** DeepSeek thinking mode：前一轮的 reasoning_content 必须回传 */
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  name?: string
}
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
```

---

## 9. 诚实裁剪与边界

| 范围 | 状态 |
|---|---|
| chat / stream / tools / progress / error 模型 | ✅ v1 实现 |
| `x:*` 透传、未知事件/字段兼容 | ✅ v1 规则生效 |
| agent 引擎（`a.agent()`）、`wf:step`、审批事件 | ✅ 已实现 |
| embeddings | ❌ 不做（DeepSeek 无此 API） |
| Anthropic/OpenAI 原生协议 | ❌ 不做（OpenAI 兼容已覆盖，baseUrl 可换） |
| 多 agent 编排 | ❌ 不承诺（子 agent = 工具已覆盖） |
| 审批持久化 | ❌ 不做（连接断 = 会话亡；持久化等 agent 长任务化 + queue） |
| 分钟级长任务 | ⚠️ 工具入队即返回（`ctx.queue`），进度走独立通道（WS/SSE 订阅）——app 编排 |
| 前端通用 HTTP 追踪/时间线面板 | ⏸ 信号（浏览器 DevTools 已覆盖前端部分） |

## 10. 陷阱清单（来自真实实现）

1. **partial chunk / UTF-8 边界**：SSE 解析必须 buffer + `TextDecoder(stream: true)`，`\n` 切行，末段保留到下次。
2. **`[DONE]` 终止符**：读到即结束，不当作 JSON 解析。
3. **tool_calls id 只在首个 chunk**（DeepSeek）：后端必须聚合完整 tool_call 再发 `wf:tool_call`；无 id 的后续 chunk 追加到最后一个。
4. **reasoning_content 必须回传**（thinking 模式）：`ChatMessage.reasoning_content` 随消息往返，否则推理断档。
5. **SSE 注释行 `:` 与空行**：跳过。
6. **非 JSON 行**：忽略不抛错。
7. **usage 可能只在最后一 chunk**（DeepSeek）：聚合后发 `wf:usage`，`wf:done` 再带最终值。
8. **审批回传 id 一次性**：防重放，用后即焚。
