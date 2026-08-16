# Sandbox 事件流方案（2026-12——执行状态：阶段 1-4 全部完成）

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

## 阶段 2：状态推导（期望 = fold——reconcile 对照）——已完成

- reconcile 漂移检测事件：`reconcile:drift`（reason: orphan——容器存在无记录
  绕过点；container-stopped/missing——期望 running 但容器停/缺——外部操作无事件；
  expired——超龄重建）+ `reconcile:idle-stop`（idle 回收时长可审计）
- 自愈动作（rm/restart/recreate）随 drift 事件（检测 + 修复成对可审计）

## 阶段 3：调度器事件驱动——已完成

- `evict`（reason: pool-budget——LRU 驱逐——释放内存可见——任务完整性 > 池吞吐）
- `queue:rejected`（预算超限——不静默降级——可审计）
- 活跃度/配额的事件驱动调度（规模化基础——1000 部门的钥匙）

## 阶段 4：持久化 + TTL——已完成

- `subscribeSandboxEvents(fn)`（emit 同步回调——不丢事件——退订返回）
- manager 订阅：**结果类事件入库**（exec:end/timeout/error + 生命周期（create/
  status/stop）+ 漂移（reconcile:drift/idle-stop）+ 调度（evict/queue:rejected/
  quota:rejected）+ container:* → 既有 sandbox_events 表（logEvent——fire-and-forget）
  ——**降频**（exec:start/queued/ensure:cache-hit 等频繁事件只留内存环形——不入库）
- **TTL 清理**（reconcile 每轮——`SANDBOX_EVENT_RETENTION` 默认 7 天——历史归档）

## 风险与裁剪

- 事件可能丢（进程崩溃）→ reconcile 兜底（事件流 + docker 实际对照——双源校验）
- exec 事件量大 → 降频聚合（end 事件带摘要——不逐输出）
- 不变量：**容器状态变化必须有事件**——audit 对照（与前端 auditDomEvents 同理念）
