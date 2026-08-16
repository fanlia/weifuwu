# AI 事件流——三端打通（vdom + ai + sandbox）（2026-12——已完成）

> 统一事件流模型：`{ entity, action, target, payload }`——vdom（前端 DOM =
> fold(事件流)）+ ai（LLM 调用/工具决策）+ sandbox（容器/exec）——**全链路一条链**。

## 三端事件模型

| 端 | entity | 关键事件 | 环形缓冲/查询 |
|---|---|---|---|
| **vdom**（前端） | comp/node/text/diff/render... | comp:build（reason）/node:insert/diff:transition | `__wf_tail`/`__wf_builds` |
| **ai**（LLM 调用） | **ai** | llm:start/step/token/tool:call/tool:result/done/error/usage | `__ai_events`/`/api/ai/events` |
| **sandbox**（容器） | **sandbox** | exec:start/end/queued/mount:bind/reconcile:drift/evict | `__sandbox_events`/`/api/sandboxes/events` |

## AI 事件流（src/services/ai-events.ts）

- `aiEmit`（环形 5000——与 sandbox 同构）+ `aiEvents(n, {agentId, action, messageId})`
- `aiActionFromWf`（wf:* → ai:* 映射——桥接统一命名）
- **桥接点**：agent-runner 的 WfEmitter 统一入口（wf:* 全经过）——target = agentId——
  payload 含 messageId/departmentId（跨层关联键）——token 降频（只发首个——done 覆盖）
- API：`GET /api/ai/events?n=&agentId=&action=&messageId=`

## 跨层关联键（三端打通）

```
vdom ↔ ai ：messageId（前端 wf:token/wf:done ↔ ai 事件——同一 AI 回复）
ai ↔ sandbox：departmentId + tool + 时间窗（ai tool:call ↔ sandbox exec:start——
             同部门同工具 30s 窗内——工具决策 ↔ 容器执行一条链）
```

## 验证（端到端——技术部写文件任务）

**AI 事件流**（25 条）：
```
step(llm) → token('我') → tool:call(call_agent) → step(tool) → tool:result → ...
```
**Sandbox 事件流**（30 条）：
```
exec:start(tool: read/write——departmentId: f2172633...) → ensure:cache-hit →
exec:queued → exec:end → mount:bind(工作目录)
```
**关联**：AI tool:call（写文件决策）↔ 沙盒 exec（write——技术部——时间窗内）——
全链路一条链（用户消息 → AI 决策 → 沙盒执行）。

## 测试

+3（发射/查询过滤/映射/订阅）——全绿。

## 后续（可选）

- ai 事件持久化（与 sandbox 同模式——结果类入库 + TTL——规模化前置）
- 三端统一查询工具（前端 UI——一次事故全链路回放面板）
