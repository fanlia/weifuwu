# Sandbox 事件流方案（2026-12——执行状态：阶段 1 已完成）

> 哲学：与前端 vdom3 "DOM = fold(事件流)" 同构——**容器期望状态 = fold(sandbox 事件流)**
> ——沙盒的一切操作（生命周期/exec/挂载/镜像/调度）都有事件——状态可回放/
> 可对照（docker 实际）/可审计——"无事件流不操作"的沙盒层不变量。
>
> 优势：可观测（exec 挂起/回收原因可查）· 可回放（事故状态重建）· 可对照自愈
> （绕过点检测——漂移事件→修复）· 可测试（事件序列断言）· 调度基础（LRU/
> 配额/排队事件驱动——1000 部门规模化的钥匙）· 端到端统一心智（前端+沙盒）。

---

## 阶段 1：事件发射全覆盖（已完成）

**核心模块**（`src/sandbox/events.ts`）：
- `sandboxEmit(action, target, payload)`——环形缓冲（5000 条——溢出覆盖——与前端 stream 同构）
- `sandboxEvents(n, { sandboxId, action })`——查询（按沙盒/动作过滤）
- `resetSandboxEvents()`——测试隔离
- 全局调试工具：`__sandbox_events(n, filter)` / `__sandbox_tail(n)`（与前端 __wf_tail 同风格）

**发射点全覆盖**：

| 域 | 事件 | 位置 |
|---|---|---|
| 生命周期 | `create` / `stop` / `status`（requested/running/stopped/error） | manager.ts |
| 配额 | `quota:rejected`（配额满——明确拒绝可审计） | manager.ts create |
| exec | `exec:start` / `exec:end` / `exec:timeout` / `exec:error`（耗时/错误——队列等待在 docker 层） | manager.ts runTool |
| 队列 | `exec:queued`（排队可见——exec 延迟可审计） | docker.ts runTool |
| ensure | `ensure:cache-hit`（readiness 缓存命中——工具调用降为 1 次 exec） | docker.ts doEnsure |
| 镜像 | `image:pull`（非默认镜像拉取） | docker.ts doEnsure |
| 挂载 | `mount:bind`（工作目录 bind mount——hostPath/containerPath/mode） | docker.ts runArgs |
| 容器动作 | `container:stop/start/restart/rm` | docker.ts containerAction |
| reconcile | `reconcile:start/skip/end`（created/started/stopped/terminated/orphans） | manager.ts |

**测试**（`test/sandbox-events.test.ts`）：发射/查询（按 sandboxId/action 过滤）/
环形溢出（5000 容量——最新保留）——2 测试全绿。

---

## 阶段 2：状态推导（期望 = fold——reconcile 对照）——待实施

- reconcile 从"DB 快照"改为"事件流推导期望状态"（重放事件——活跃 exec/最近状态）
- 漂移检测（docker 实际 vs 期望）→ `reconcile:drift` 事件（绕过点——外部操作容器）

## 阶段 3：调度器事件驱动——待实施

- 活跃度 = 最近 exec 事件（LRU 驱逐事件驱动——非定时扫描）
- 容量 = alloc/limit 事件聚合（全局预算——`queue:enqueue/dequeue`）
- 配额 = 部门 exec 事件计数

## 阶段 4：持久化 + TTL——待实施

- exec 摘要归档（DB/日志——降频聚合——同前端 stream:overflow 理念）
- 历史 TTL（活跃最近 N 天）

## 风险与裁剪

- 事件可能丢（进程崩溃）→ reconcile 兜底（事件流 + docker 实际对照——双源校验）
- exec 事件量大 → 降频聚合（end 事件带摘要——不逐输出）
- 不变量：**容器状态变化必须有事件**——audit 对照（与前端 auditDomEvents 同理念）
