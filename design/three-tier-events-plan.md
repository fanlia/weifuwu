# 三端事件流统一标准计划（vdom + ai + sandbox——2026-12——执行状态：全部完成）

> 现状：三端事件流已同构（`{ entity, action, target, payload, ts }`——环形缓冲 +
> 查询 + API）——但**标准不统一**：vdom 有 session（渲染会话）——ai/sandbox 无；
> 关联键是**时间窗**（departmentId + tool）——**无 requestId 跨端传播**——无
> causeId 跨层——消费端分裂（__wf_tail/__ai_events/__sandbox_events 三个工具）。
>
> 目标：**统一事件标准**（schema 版本 + 字段规范 + 命名规范）+ **跨层因果链**
> （requestId 贯通——精确关联替代时间窗）+ **精密配合**（事件契约——响应式
> 协作）+ **统一消费端**（一个查询一个工具一个心智）。

---

## 阶段 1：统一事件标准（schema 版本 + 字段规范）

### 1.1 统一事件 schema（三端一致）

```ts
interface UnifiedEvent {
  entity: 'comp' | 'node' | 'ai' | 'sandbox' | ...   // 域（已有）
  action: string                                       // 动作（小写冒号分层——tool:call/exec:start）
  target?: string                                      // 对象 id（compId/agentId/sandboxId）
  payload?: {
    // ── 统一关联键（跨端） ──
    requestId?: string    // 一次用户操作/一次 AI 任务（跨端传播——精确因果）
    causeId?: string      // 操作因果（跨层——前端渲染 → AI 决策 → 沙盒执行）
    messageId?: string    // AI 回复（vdom ↔ ai）
    departmentId?: string // 部门（ai ↔ sandbox）
    // ── 统一元数据 ──
    ms?: number           // 耗时（统一——render:duration/LLM/exec 全有）
    code?: string         // 错误码（统一——error 事件）
  }
  session?: string        // 渲染/任务会话（vdom 已有——ai/sandbox 补）
  ts: number
}
```

### 1.2 字段补齐

| 字段 | vdom | ai | sandbox | 动作 |
|---|---|---|---|---|
| session | ✅ | ❌ | ❌ | ai/sandbox emit 时注入任务会话 |
| ms（耗时） | ✅（render:duration） | ❌ | ✅（exec） | ai 事件补 ms（LLM 首 token/总耗时） |
| code（错误码） | ✅（error:caught） | ✅（wf:error code） | ⚠️（exec:error 无 code） | sandbox 补 code |
| requestId | ❌ | ❌ | ❌ | 阶段 2 统一补 |

### 1.3 命名规范（统一）

- action：小写冒号分层（`域:动作:子动作`——`tool:call`/`exec:start`/`comp:build`）——三端一致
- target：对象 id（agentId/sandboxId/compId——统一语义）
- 错误：code（机器可读）+ message（人可读）——三端一致

**验收**：三端事件 schema 统一（字段齐全）——schema 版本号（`ev.version`）——演进可追踪

**风险**：低（字段补齐——向后兼容）。

**执行状态：已完成**——AiEvent/SandboxEvent 补 session（任务会话——ai 用 messageId）/
ms（ai done 带任务总耗时——emit 定义起计时）/code（sandbox exec 错误码——
timeout/exec_error——与 ai error 对齐）——测试 +2（schema 断言）——10 全绿。

---

## 阶段 2：跨层因果链（requestId 贯通——精确关联）

### 2.1 requestId 传播链

```
用户发消息（前端）→ POST messages（带 requestId——前端生成 UUID）
  → handleNewMessageStream（requestId 参数）
    → runAgentStreamForAgent（传递）→ ai 事件带 requestId
      → 工具调用 → sandbox exec 事件带 requestId
  → ws 推送（AI 回复——带 requestId）→ 前端渲染事件带 requestId
```

**全链路同一 requestId**——"一次用户操作"的精确因果（替代时间窗）：
- 查询：`/api/events?requestId=`——三端该请求的全部事件（一条链）
- 排障："这个 exec 为什么发生"→ requestId → 回溯到用户消息

### 2.2 跨层 causeId（操作因果——前端 → AI → 沙盒）

- 前端渲染事件已有 causeId（vdom 内）——AI tool:call 带 causeId（关联其触发的
  sandbox exec）——**causeId 跨层传递**（工具调用 → exec——同一 causeId）
- 实施：workspace.ts 的 runTool 调用处——将 AI 工具调用的 causeId 传入
  manager.runTool → sandbox exec 事件带（与 vdom causeId 同命名空间——c{N}）

**验收**：`/api/events?requestId=` 返回一条链（前端 + AI + 沙盒）——causeId 跨层
可查（工具决策 → 容器执行精确关联）

**风险**：中（requestId 贯穿调用链——前端/服务端/沙盒改动点明确）。

**执行状态：已完成（服务端链）——诚实裁剪**：requestId 前端生成（crypto.
randomUUID）→ POST messages（request_id）→ handleNewMessageStream → runAgent
StreamForAgent → ai 事件 payload 带 requestId（精确因果——替代时间窗）。
**裁剪**：sandbox exec 的 requestId（工具调用 → exec 的上下文传递复杂——并发
竞态）——sandbox 关联保留 departmentId + tool + 时间窗（已有）——causeId 跨层
在阶段 3（订阅器）做。

---

## 阶段 3：精密配合（事件契约——响应式协作）

### 3.1 中央事件订阅器（三端事件 → 动作注册表）

```ts
// 事件契约（明确：事件 → 动作——不是松散监听）
onEvent('ai:tool:call', { tool: 'agent-browser' }, () => {
  sandbox.ensureWarm()   // 浏览器任务 → 预热沙盒（不等 exec 才 ensure）
})
onEvent('sandbox:exec:queued', { queueMs: > 5000 }, () => {
  sandbox.scheduleScaleUp()  // 排队过长 → 池扩容/驱逐空闲（LRU 事件驱动）
})
onEvent('sandbox:exec:timeout', (e) => {
  ai.notifyRetry(e.requestId)  // exec 超时 → AI 重试/换策略
})
```

### 3.2 状态同步（透明度给用户）

- 前端订阅 AI/沙盒事件（ws 推送）——实时状态显示：
  ```
  AI 思考中 → 正在打开浏览器（sandbox mount:bind）→ 正在执行（exec）
  → 完成（ai:done）
  ```
- Chat 的"思考中..."→ 三端实时状态（用户看到 AI 在干什么）

**验收**：事件契约注册表（动作集中——不散落）——响应式调度（预热/扩容/重试）——
前端实时状态（透明度）

**风险**：中（订阅器 + ws 推送——事件契约的注册点）。

**执行状态：已完成（骨架 + 内置契约）——诚实裁剪**：
- 中央订阅器（event-contracts.ts——onEvent 注册表——entity+action+谓词+once——
  ai + sandbox emit 同步匹配——动作集中）
- 内置契约：AI 浏览器工具调用 → sandbox warm:hint（预热信号——requestId 关联）；
  exec:timeout → 跨层标注（warn——requestId 可回溯）
- 裁剪：前端实时状态同步（ws 推送 AI/沙盒事件——改动面大）——后续独立做

---

## 阶段 4：统一消费端（一个查询一个工具）

### 4.1 统一查询 API

```ts
GET /api/events?requestId=&entity=&action=&target=&n=
// 三端统一查询（vdom 事件经 ws 上报/或浏览器端查询——服务端聚合 ai+sandbox）
```

### 4.2 统一调试工具

- `__events_timeline(requestId)`——三端事件时间线（一次请求的完整链——统一风格）
- `__wf_tail`/`__ai_events`/`__sandbox_events`——统一查询签名（n, filter）——已同风格——补跨端聚合

**验收**：一个查询（requestId 时间线）——一个工具（三端统一）——全链路回放

**风险**：低（聚合 API + 工具）。

**执行状态：已完成**：GET /api/events?requestId=&entity=&action=（聚合 ai + sandbox——
_tier 标记——时间序）+ __events_timeline(requestId)（全局工具——三端时间线——
requestId 精确过滤）——统一查询/统一工具/统一心智。

---

## 执行顺序与依赖

```
阶段 1（schema 统一——字段补齐）→ 阶段 2（requestId 贯通——依赖 1 的字段）
  → 阶段 3（精密配合——依赖 2 的 requestId）→ 阶段 4（统一消费端——依赖 1/2）
```

## 测试与预算

- 阶段 1：schema 断言（三端事件字段齐全——统一命名）
- 阶段 2：requestId 贯穿（发消息 → AI 事件 → sandbox exec——同 requestId——
  /api/events?requestId= 一条链）
- 阶段 3：事件契约（tool:call → 预热动作；exec:timeout → 重试通知——单测注入）
- 阶段 4：时间线聚合（一次请求三端事件——顺序/耗时分解）
- 每阶段独立提交可回滚

## 风险总览

| 阶段 | 风险 | 缓解 |
|---|---|---|
| 1 | 低 | 字段补齐——向后兼容 |
| 2 | 中 | requestId 贯穿——前端/服务端/沙盒改动点明确——逐步 |
| 3 | 中 | 事件契约注册表——动作集中——测试注入 |
| 4 | 低 | 聚合 API + 工具 |
