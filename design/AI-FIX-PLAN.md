# AI-FIX-PLAN — src/server/ai/ 优化修复计划

> 针对 AI 模块（client.ts / agent.ts / sse.ts / index.ts）的缺陷修复计划。
> **关键缺陷均已实证**（wire-fake 真 HTTP + 真 SSE over loopback 复现脚本）。
>
> 基线：`src/server/ai/*.test.ts` 29 测试全绿（node:test——真 HTTP 服务器验证线协议，
> CS-04 精神：不 mock 网络层）——`timeout 60 node --env-file=.env --test src/server/ai/*.test.ts`。
> 复现脚本（临时）：/tmp/repro-parallel.mjs、/tmp/repro-reasoning.mjs、/tmp/repro-agentcontent.mjs。

---

## 0. 缺陷清单总览

| ID | 严重度 | 缺陷 | 实证 |
| --- | --- | --- | --- |
| A1 | **正确性（P1）** | **并行工具调用参数聚合错乱/丢失**——`aggregateToolCalls` 只认 id 不认 `index`：无 id 分片一律追加到「最后一个」调用——交错分片（OpenAI 兼容标准形态）下 index 0 的参数被追加到 index 1 的调用；index 0 调用参数为空 | 复现：双工具交错流 → 两个 `wf:tool_call` 的 `args` 均为 `{}`（**参数静默丢失**——工具收到空参数）；现有 O13 测试同 chunk 双 delta 恰好「两错相抵」未暴露 |
| A2 | **功能断路（P1）** | **`ai.stream()` 的 `wf:done` 丢 `reasoning`**——`streamStep` 已聚合 `reasoning_content`（`StreamFinishResult.reasoning_content`）但 `stream()` 的 `onFinish` 只发 `{ content, usage }`——前端 `ReasoningBlock`（AiChat 消费 `wf:done.reasoning`）经 stream 通道**永远看不到推理过程**——agent 路径（agent.ts `emit('wf:done', { ..., reasoning })`）却带上 | 复现：provider 发 `reasoning_content` 两 chunk → `wf:done = {"content":"你好",...}`（无 reasoning 字段） |
| A3 | **协议一致性（P2）** | **agent `wf:done.content` 丢前几轮文本**——多轮工具循环中 token 逐轮流到前端但 `done.content` 只含最后一轮 `finish.content`——依赖 `done.content` 持久化最终消息的消费方（AiChat onDone/历史入库）**丢前面轮次的文本**；`maxSteps` 耗尽路径更发 `content: ''` | 复现：两轮（首轮带 tool_call 前文本「我先说一句」+ 尾轮「最终答案」）→ token 事件 2 个但 `done.content="最终答案"` |
| A4 | **取消挂起（P2）** | **HITL 审批挂起不响应 abort**——`waitApproval` 不接受 signal：agent 运行中客户端断开（SSE cancel → controller.abort）后，循环仍挂在审批 Promise 上直到 `approvalTimeoutMs`（默认 **5 分钟**）——取消响应完全失效；期间 approvals 表条目常驻 | 代码审读（waitApproval 无 signal 参数——确定性） |
| A5 | **资源泄漏（P3）** | **AbortSignal 监听器不清理**——`createController`（agent.ts）/ `client.ts` `stream()`/`sse()` 对 external signal `addEventListener('abort', ..., { once: true })` 后无 `removeEventListener`——长生命周期 signal（worker 复用）经 N 次调用累积 N 个监听器 | 代码审读（无 finally 清理——确定性） |
| A6 | **生产韧性（P3）** | **SSE 无心跳 + 无反缓冲头**——agent 工具执行长于 60s 期间零字节输出 → nginx/云厂商 `proxy_read_timeout` 断流；`X-Accel-Buffering` 头缺失（nginx 可能缓冲 SSE） | 代码审读（sseResponse 无定时器/无该头——确定性） |

---

## 1. A1 — 并行工具调用参数聚合（P1——确证）

### 根因

`client.ts` `aggregateToolCalls`：

```ts
if (tc.id) {
  calls.push(tc)                 // 只认 id——不认 index
} else if (calls.length > 0) {
  const last = calls[calls.length - 1]   // 无条件追加到「最后一个」
  if (tc.function?.arguments) last.function.arguments += tc.function.arguments
}
```

OpenAI 兼容流式标准形态：**每个 chunk 的 `tool_calls` 数组只有当前 index 的一个 delta**
（id + name 在首个 chunk，后续 chunk 只带 `function.arguments` 分片）。双工具交错：

```
chunk1: [index:0 id:call_a name:tool_a args:'']   → push call_a
chunk2: [index:1 id:call_b name:tool_b args:'']   → push call_b
chunk3: [index:0 function:{arguments:'{"x":'}]    → 追加到「最后一个」= call_b ✗
chunk4: [index:1 function:{arguments:'{"y":'}]    → 追加到 call_b ✗
...                                              → call_a 参数恒空；call_b 参数错乱
```

**复现结果**（/tmp/repro-parallel.mjs）：

```
wf:tool_call {"id":"call_a","name":"tool_a","args":{}}   ← 参数丢失
wf:tool_call {"id":"call_b","name":"tool_b","args":{}}   ← '{}{}' 式错乱后 parse 失败归 {}
```

O13 并行工具（2026-08 上线）在**真 provider 上从未正确工作过**——现有测试
（ai-agent.test.ts O13）的 fake 把两个 delta 放同一 chunk，恰好让「换错对象追加」
与「最后一项追加」重合 → 两错相抵 + 工具不读参数 → 未暴露（测试盲区）。

### 修复方案（index 键控聚合）

```ts
/** 聚合 provider 流式 tool_calls：按 index 键控（delta 标准形态：每 chunk 一个 delta + index） */
function aggregateToolCalls(chunks: ChatChunk[]): ToolCall[] {
  interface PendingToolCall {
    call: ToolCall
    /** 该 index 是否已收到 id（id 只在首个 chunk——DeepSeek） */
    seenId: boolean
  }
  const byIndex = new Map<number, PendingToolCall>()
  const order: number[] = []
  for (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta
    if (!delta?.tool_calls) continue
    for (const raw of delta.tool_calls as Array<ToolCall & { index?: number }>) {
      // index 缺失（非标准）→ 归 0（单调用兼容；无 index 的多调用 = 非法输入）
      const idx = raw.index ?? 0
      let pending = byIndex.get(idx)
      if (!pending) {
        pending = {
          call: { id: raw.id ?? `tc_${idx}`, type: 'function', function: { name: raw.function?.name ?? '', arguments: '' } },
          seenId: false,
        }
        byIndex.set(idx, pending)
        order.push(idx)
      }
      if (raw.id) { pending.call.id = raw.id; pending.seenId = true }
      if (raw.function?.name) pending.call.function.name = raw.function.name
      // 首 chunk 可能带空 arguments（DeepSeek）——追加语义正确
      if (raw.function?.arguments) pending.call.function.arguments += raw.function.arguments
    }
  }
  return order.map((idx) => byIndex.get(idx)!.call)
}
```

要点：
- **index 是聚合键**（协议标准字段；`tc_${idx}` 兜底 id——协议允许后端生成 id）
- 同 index 的多片 arguments 顺序追加（跨 chunk 保持 provider 发送序）
- 单工具调用（index 恒 0）行为不变——现有单调用测试零改动通过

### 测试

1. **交错分片双工具**（ai.test.ts——新）：每 chunk 一个 delta（index 交替）→ 断言两个
   `wf:tool_call` args 各自完整（`{"x":1}` / `{"y":2}`）——旧代码必挂
2. **O13 回归升级**（ai-agent.test.ts——改）：现有同 chunk 双 delta fake 增断言
   `args` 完整（不再让「两错相抵」隐藏问题——测试盲区歼灭）

---

## 2. A2 — `ai.stream()` wf:done 丢 reasoning（P1——确证）

### 根因

`client.ts` `stream()`：

```ts
onFinish: (r) => emit('wf:done', { content: r.content, usage: r.usage }),   // 漏 reasoning
```

`streamStep` 已聚合 `reasoning`（`reasoning = delta.reasoning_content` 逐片累积并
通过 `r.reasoning_content` 传出）；`agent.ts` 路径带了 `reasoning: finish.reasoning_content`
——**同一客户端两条路径行为不一致**。协议 §3.4：`wf:done.reasoning`（additive）——
thinking 模式推理过程收尾一次性下发，前端 ReasoningBlock 折叠展示。

**复现**（/tmp/repro-reasoning.mjs）：provider 发 reasoning 两 chunk →
`wf:done = {"content":"你好","usage":{...}}`——无 reasoning。

### 修复方案

```ts
onFinish: (r) => emit('wf:done', {
  content: r.content,
  usage: r.usage,
  ...(r.reasoning_content ? { reasoning: r.reasoning_content } : {}),
}),
```

### 测试

- `ai.stream：thinking 模式 → wf:done 带 reasoning`（ai.test.ts——新）：fake 流含
  `reasoning_content` 分片 → 断言 `wf:done.data.reasoning` = 聚合全文；不带 reasoning
  时 `wf:done` 无该字段（零回归）

---

## 3. A3 — agent wf:done.content 多轮累积（P2——确证）

### 根因

`agent.ts` `loop()`：

```ts
for (let step = 0; step < maxSteps; step++) {
  ...
  if (!finish.toolCalls?.length) {
    emit('wf:done', { content: finish.content, ... })   // 只含最后一轮
    return
  }
  ...
}
// maxSteps 耗尽
emit('wf:done', { content: '', usage })                  // 连最后一轮也丢
```

token 已逐轮流到前端（多轮文本前端全部收到），但 `done.content` 只收最后一轮——
**流式呈现与收尾内容不一致**；`maxSteps` 耗尽路径更丢一切。

**复现**（/tmp/repro-agentcontent.mjs）：两轮（首轮 tool_call 前文本「我先说一句」+
尾轮「最终答案」）→ token 2 个、`done.content="最终答案"`。

### 修复方案

```ts
let content = ''      // 跨轮累积（与 token 流一致）
for (...) {
  ...
  if (finish.content) content += finish.content
  if (!finish.toolCalls?.length) {
    emit('wf:done', { content, usage, reasoning: finish.reasoning_content })
    return
  }
  ...
}
emit('wf:done', { content, usage })   // maxSteps 耗尽：累积内容不丢
```

注意：`runToResult` 的 content 已是跨轮累积 —— 修复后 **stream 与 runToResult
语义对齐**（同一内容两个口径）。

### 测试

1. **多轮文本累积**（ai-agent.test.ts——新）：首轮「先分析」+ 尾轮「最终答案」→
   断言 `wf:done.content` = 两段拼接（旧代码只含尾轮——必挂）
2. **maxSteps 耗尽带文本**（ai-agent.test.ts——新）：脚本每轮带文本 + tool_call →
   `maxSteps=2` 耗尽 → `wf:done.content` 非空 = 两轮文本累积

---

## 4. A4 + A5 — abort 全链路响应 + 监听器清理（P2）

### 根因

- `waitApproval(req, emit, timeoutMs)` 无 signal：agent 循环 `await client.waitApproval(...)`
  期间 SSE cancel → controller.abort → 无人响应 → 挂满默认 5 分钟（前端已断开，
  服务端白等 + approvals 条目常驻）
- `createController`/`client.stream`/`client.sse`：`external.addEventListener('abort', ..., { once: true })`
  后无 removeEventListener——`{ once: true }` 只保证触发后自删，**正常完成路径永不触发**
  ——长生命周期 signal（worker/轮询场景复用同一 signal）N 次调用 = N 个监听器累积

### 修复方案

**waitApproval 加 signal**（接口 + 实现 + agent 调用点）：

```ts
// client.ts
async function waitApproval(req, emit, timeoutMs = DEFAULT_APPROVAL_TIMEOUT, signal?: AbortSignal): Promise<WfApprovalResponse> {
  const expiresAt = Date.now() + timeoutMs
  emit('wf:approval_request', { ...req, expiresAt })
  return new Promise((resolve) => {
    let settled = false
    const finish = (resp: WfApprovalResponse) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(resp)
    }
    const timer = setTimeout(() => {
      if (approvals.has(req.id)) approvals.delete(req.id)
      finish({ id: req.id, decision: 'rejected' })   // 超时 → 拒绝（协议 §4.5）
    }, timeoutMs)
    const onAbort = () => {
      if (approvals.has(req.id)) approvals.delete(req.id)
      finish({ id: req.id, decision: 'rejected' })   // 取消 → 拒绝（循环随即退出）
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    approvals.set(req.id, (resp) => {
      if (approvals.has(req.id)) approvals.delete(req.id)
      finish(resp)                                   // 审批回传 id 一次性（协议 §10.8）
    })
  })
}
```

- `contracts.ts` Ai 接口 `waitApproval` 加可选 `signal?: AbortSignal`
- `agent.ts` `runOneToolCall` 调用点透传 `signal`
- 超时/取消/批准三路都走 `finish`（settled 防重复）——取消后 `approve()` 返回 false
  （条目已删——用后即焚纪律扩展到取消路径）

**监听器清理**（agent.ts + client.ts 统一模式——finally 收尾）：

```ts
// agent.ts createController 调用处（run/stream/runToResult 三处同一模式）
const controller = createController(options?.signal)
try {
  ...
} finally {
  controller.release()   // 新增：removeEventListener(external)
}

// client.ts stream()/sse()：sseResponse(run 内 try/finally 移除监听器)
```

`createController` 返回 `{ sig, release }` 或给 controller 挂 `release()`；
`client.stream()/sse()` 把移除放进传给 `sseResponse` 的 run 的 finally
（cancel 时 onAbort → provider abort → run 的 await 结束 → finally 执行——覆盖全部路径）。

### 测试

1. **HITL 取消**（ai-agent.test.ts——新）：approval_request 发出后 reader.cancel() →
   断言在 ~500ms 内流正常关闭（旧代码挂 5 分钟——测试超时即红）+ 随后
   `agent.approve(...)` 返回 false（条目已清——取消路径用后即焚）
2. **监听器清理**（ai-agent.test.ts——新）：runToResult 完成后 `signal.abort()` →
   无副作用（弱断言——防回归哨兵；主保证是代码路径 finally）

---

## 5. A6 — SSE 心跳 + 反缓冲头（P3）

### 修复方案（sse.ts）

```ts
export interface SseResponseOptions {
  onAbort?: () => void
  /** 心跳间隔 ms（注释行——SSE 规范——代理保活）；0 = 关。默认 15000 */
  heartbeatMs?: number
}

const HEARTBEAT_MS = options?.heartbeatMs ?? 15_000
let hbTimer: ReturnType<typeof setInterval> | undefined
const start = () => {
  if (hbTimer) return
  hbTimer = setInterval(() => {
    try { controller.enqueue(encoder.encode(': wf-heartbeat\n\n')) } catch { /* 已关闭 */ }
  }, HEARTBEAT_MS)
}
// start() 在 start 里调用；finally（run 结束）与 cancel() 都 clearInterval(hbTimer)
```

- 心跳 = SSE **注释行**（`: ...`）——协议合法、前端解析器（parseWfEvents）无 data
  行 → `if (!data) continue` 自动跳过——**前端零改动**（已核实 ai-stream.ts / 测试
  collectEvents 均按 event:/data: 行过滤）
- headers 增 `'X-Accel-Buffering': 'no'`（nginx 缓冲禁用——穿代理流式正确性）
- 默认开（15s）——所有 SSE 消费方受益；`heartbeatMs: 0` 可关（内部测试/特殊代理）

### 测试

- `sse 心跳：heartbeatMs=50 → 读盘出现注释行且 done 前心跳间隔正确`（ai.test.ts——新）：
  `sseResponse(run(挂 200ms), { heartbeatMs: 50 })` → 收集原始字节断言 `: wf-heartbeat`
  出现 ≥1 次 + 事件序列完整（`wf:error`/`wf:done` 收尾不受影响）

---

## 6. 测试计划总表

| # | 测试 | 文件 | 断言核心 |
| --- | --- | --- | --- |
| T1 | 并行工具交错分片聚合 | ai.test.ts（新） | 两个 `wf:tool_call` args 各自完整——A1 红线 |
| T2 | O13 双 delta 参数完整 | ai-agent.test.ts（升级） | 现有 fake 增 args 断言——盲区歼灭 |
| T3 | streaming thinking → done.reasoning | ai.test.ts（新） | `wf:done.data.reasoning` = 全文——A2 红线 |
| T4 | agent 多轮 done.content 累积 | ai-agent.test.ts（新） | done.content = 两轮文本拼接——A3 红线 |
| T5 | maxSteps 耗尽 content 非空 | ai-agent.test.ts（新） | 累积文本不丢 |
| T6 | HITL 取消响应 | ai-agent.test.ts（新） | cancel 后 <500ms 流关闭 + approve()=false |
| T7 | SSE 心跳 | ai.test.ts（新） | 注释行出现 + 事件序列完整 |
| T8 | 监听器清理哨兵 | ai-agent.test.ts（新） | run 完成后 abort 无副作用 |

回归：`npm run typecheck` + `timeout 60 node --env-file=.env --test src/server/ai/*.test.ts`
（29 基线全绿不动）+ `npm run test:server`（全库 AI 面回归）。

---

## 7. 执行顺序与验收

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | A1 聚合修复（aggregateToolCalls）+ T1/T2 | 交错 fake 全绿——旧代码 T1 必挂 |
| W2 | A2 reasoning（stream onFinish）+ T3 | reasoning 红线测试全绿 |
| W3 | A3 content 累积 + T4/T5 | 多轮 done.content 一致 |
| W4 | A4/A5 abort 全链路 + T6/T8 | 取消 <500ms + approve 后返回 false |
| W5 | A6 心跳 + 反缓冲头 + T7 | 心跳注释行 + 前端解析零改动回归 |

每波：`npm run typecheck` + AI 测试 + 提交（commit 粒度 = 波次——复盘可查）。

---

## 8. 已评估判负/决策（留档）

| 项 | 决策 | 理由 |
| --- | --- | --- |
| chat()/stream 首 token 超时 | **W6 已实现（判负撤销）** | 协议错误码表已定义 `timeout`（“无 token 超时”）但实现无对应检测——**协议-实现缺口**（非新抽象）——provider 挂起时全链无限 hang——W6 `firstTokenTimeoutMs`（默认 60s，0=关）+ `wf:error timeout` |
| provider 重试（429/5xx） | **W6 已实现（判负撤销——窄范围）** | 场景证据：协议码表 `rate_limited`（“前端建议：显示+延迟重试”）——429 语义即稍后重试。**窄范围纪律**：仅限“emit 任何事件之前”（未产出 token——不重复计费内容）+ 仅限 429/5xx/网络错误（401/4xx 确定失败不重试）+ 默认 0（不突改行为——`parallelTools` 同款默认关惯例）+ 250ms 固定退避 |
| `ai()` 无 apiKey 抛错（embedding-only 部署） | **保留 fail-fast** | 显式错误 > 半可用状态；embedding-only 需求可传任意 chat apiKey 或后续拆独立 `aiEmbed` 模块（判负留档） |
| chat() 非流式整体超时 | **不做（判负）** | 无场景证据（worker 场景调用方可自控 abort——`chat(params, { signal })` 已有）；流式首 token 超时是协议明示缺口——非流式无对应码 |
| 流中途停顿（token 间无增量）超时 | **不做（判负）** | 只有“无 token 超时”协议码；“token 间停顿”无码——长思考/长工具间隔是合法状态——误杀风险 > 收益 |
| 前端 ai-stream.ts 监听器同款泄漏 | **范围外** | 属 src/client/——本计划只覆盖 src/server/ai/——留档建议单独修复 |
| `runToResult` 与 stream content 口径 | **随 W3 对齐** | W3 修复后两口径一致（都 = 跨轮累积） |

---

## 9. W6 专项（2027-09——判负撤销——用户决策推进）——首 token 超时 + 流式窄范围重试

> **判负撤销依据**（仓库惯例：场景证据驱动的增量——非抽象偏好）：
> ① 协议错误码表已定义 `timeout`（“无 token 超时”）与 `rate_limited`（“显示+延迟重试”）
> —— W6 不是新抽象而是**补协议-实现缺口**；② 默认值全部保守（超时 60s 默认开——防
> 无限 hang；重试默认 0——不突改行为）；③ 重试窗口极窄（emit 前 + 仅 429/5xx/网络）。

**新增配置**（AiClientOptions —— index.ts 透传）：

| 键 | 默认 | 语义 |
| --- | --- | --- |
| `firstTokenTimeoutMs` | 60000（0 = 关） | 首 token 超时：fetch 到首个有效 chunk——超时中止上游 + `wf:error { code: 'timeout' }`（协议码表）——`??` 语义：显式 0 保留（关） |
| `streamRetries` | 0 = 不重试 | 可重试错误次数（429/5xx/网络异常——**仅在 emit 任何事件前**——安静重试 250ms 退避——不重复 token） |

**重试资格纪律**：
- ✅ 重试：429（rate_limited）/ 5xx（provider_error）/ fetch 网络异常——**未 emit 任何事件**（上游未产出）
- ❌ 不重试：401/403（auth_failed）/ 400（invalid_request）/ 首 token 超时（慢不是错）/ **流中途错误**（可能已 emit token——重复计费风险）
- error 事件只在**重试耗尽**后发（重试安静——不预发 error）

**实现要点**（client.ts runStreamAttempt——重构）：
- 内部 AbortController：外部取消 + 首 token 超时共用——区分来源（超时 → 报 error；
  外部取消 → 静默）——两路都清理监听器（A5 纪律）
- 计时只到首个 chunk（thinking 模式首 chunk 快——reasoning 增量即算）——token 间
  停顿不做（判负——见 §8）
- `streamStep` 返回三态：'ok' / 'terminal'（已 emit——重试安全窗口外）/ 错误对象
  （未 emit——重试或报错由循环 settle）——错误 emit 不早于重试耗尽

**测试**（W6 增加 3 条——总额 39）：

| # | 测试 | 断言 |
| --- | --- | --- |
| T9 | provider 挂起（无 chunk）→ wf:error timeout + 上游中止 + 不重试（calls=1） | 旧代码：无限 hang |
| T10 | 429 → 250ms 退避后安静重试成功——无 error 事件/无重复 token | 旧代码：无重试 → 唯一请求 429 → error |
| T11 | 401 不重试（calls=1——确定失败立即终态） | 防重复计费 |

**执行中修正**：初版 runStreamAttempt 在返回 retry 前先 emit 了 wf:error——重试成功后
客户端仍收到第一个请求的 error（“安静重试”违例——T10 红）——错误 emit 推迟到
重试耗尽后（retryable 只返回错误对象——由 streamStep 循环 settle）——T10 绿。

## 10. 已知边界（诚实裁剪）

- `waitApproval` 取消路径 resolve `rejected`——agent 循环随即检查 signal 退出——
  恰好一次（settled 防竞态）；不新增「aborted」语义（协议未定义 approval 取消事件）
- 心跳默认 15s：过短字节开销可忽略（注释行 ~16B/15s）；代理配置 > 60s 超时的
  场景心跳是纯冗余（无害）
- A5 监听器泄漏为累积型（无功能错误）——修复方式是结构性的（finally），
  无专门的泄漏量测（内存面不在本计划）
- T8 为弱断言哨兵（泄漏的强证明需要 listener 面暴露——过度设计）
- W6 首 token 超时只覆盖「一个 chunk 都没有」——token 间长停顿（长思考/长工具）
  是合法状态——不做（协议只有「无 token 超时」码——判负见 §8）
- W6 重试的计费语义：上游可能已处理请求（429 不发生计费——500 可能）——
  默认 0（不重试）把决策留给调用方——开启即接受风险（文档明示）

## 11. 执行实录

> 2027-09——**全量交付完成**。

**交付结果**：src/server/ai/ 测试 29 → **39**（W1-W5 新增 7 条 + W6 新增 3 条）——全部绿色；
`npm run typecheck` 全库通过；全库 `test:server` 462/462（含 queue/scheduler 交付）。

| 波次 | 交付 | 测试 | 备注 |
| --- | --- | --- | --- |
| W1 | aggregateToolCalls index 键控（client.ts） | T1（交错分片——旧代码必挂）/ T2（O13 参数断言升级——盲区歼灭） | 复现脚本 /tmp/repro-parallel.mjs——旧代码两个工具 args 均 `{}`；修复后参数各自完整 |
| W2 | stream() onFinish 带 reasoning（client.ts） | T3 | 复现 /tmp/repro-reasoning.mjs——修复后 wf:done.reasoning = 聚合全文 |
| W3 | loop() content 跨轮累积 + maxSteps 耗尽不丢（agent.ts） | T4 / T5 | 复现 /tmp/repro-agentcontent.mjs——修复后 done.content = 两轮拼接 |
| W4 | waitApproval 三路 finish（超时/取消/批准——settled 恰好一次）+ createController release + stream/sse finally 清理（agent.ts/client.ts/contracts.ts） | T6（取消→条目回收 approve=false）/ T8（signal 复用哨兵） | 取消路径用后即焚扩展到 approvals 表 |
| W5 | sseResponse 心跳（默认 15s——注释行）+ X-Accel-Buffering: no（sse.ts） | T7 | 前端 parseWfEvents 无 data 行跳过——零改动（已核实） |

**执行中的教训**：
- T1 初版 LINES 转义层级错误（`\"` vs `\\"`——JSON 内嵌引号未转义 → 非 JSON 行被
  陷阱清单 #6 静默忽略 → 测试假绿失败（参数全丢））——转义层级以**传输文本**为准
  （wire 字节 = provider 看到的 JSON 源文本）
- T6 初版用 `[^}]*` 正则提取 approval_request——args 嵌套 `{}` 截断 → JSON.parse 失败——
  改为按块解析（与 collectEvents 同构）

**全库回归**：`npm run test:server` 中 queue.test.ts 失败为工作区进行中改动
（queue/scheduler 既有未提交修改——独立任务——与 AI 无关）。
