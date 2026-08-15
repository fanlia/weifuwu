# Sandbox 一级概念 + 三层统一模型方案

> **用户决策（2026-12）**：
> ① sandbox 与 agents 平级，成为**一级概念**（独立 DB 对象/CRUD API/管理 UI/审计/配额，状态持久化）；
> ② **部门/群组升华**：部门 = 工作目录，sandbox = 计算资源，agent = 计算能力——三层统一模型，归属链从 agent 移向部门。
> 纪律：CS-04（生命周期测试连真 docker）、CS-05（诚实裁剪）、CS-06（行为变更先查旧测试——sandbox.test.ts/workspace.test.ts 断言会随归属变更挂起，需同步重写）

---

## 一、三层统一模型（架构定性）

```
┌─────────────────────────────────────────────────────────────┐
│  部门/群组 = 工作目录（数据空间）                                │
│    项目的文件系统：代码/文档/产物。成员 agent 共享同一目录。      │
│    departments.workspace_path（默认 {root}/{department_id}/） │
│                          │ 卷挂载（1:1）                      │
│                          ▼                                   │
│  sandbox = 计算资源（执行空间）                                │
│    挂在目录上的执行环境：CPU/内存/网络。部门内所有 agent 共享。   │
│    sandboxes.department_id（1 部门 = 1 目录 = 1 环境）         │
│                          │ docker exec（工具调用）             │
│                          ▼                                   │
│  agent = 计算能力（能力空间）                                  │
│    提示词 + 工具 + 技能 + 记忆。不持有文件系统/计算环境——        │
│    能力被「装入」部门环境执行。一个 agent 可加入多个部门（         │
│    执行时按当前部门解析目录/环境）。                             │
└─────────────────────────────────────────────────────────────┘
```

**OS 类比**：部门 = 目录，sandbox = 进程（挂载 cwd），agent = 程序（在 cwd 里跑）。

**这个模型解决的历史问题**：
- SANDBOX-PLAN 4.1 的纠结（「多会话并发写同一 workspace 冲突」→ agent 级容器）——归属链修正后**自洽**：workspace 本来就该属于部门（多 agent 协作共享产出物），sandbox 跟随目录（卷挂载 1:1），并发问题用执行队列解决而非改变粒度
- 多 agent 协作现在真正共享状态（同一目录 + 同一环境：依赖装一次、产物共享）——部门 = 项目的心智模型成立
- 资源复用：部门内 N 个 agent 共享 1 容器（对比现状 N 容器各 512MB）

**引入的新问题（正面回答）**：
| 问题 | 缓解 |
|------|------|
| 部门内多 agent 并发 exec 同一容器 | **per-sandbox exec 串行队列**（AI 思考时间 >> 执行时间，实际影响小）；工具调用天然间歇 |
| 并发写同一文件 | tool-runner write 改原子写（tmp + rename）+ 文档红线（AI 协作写不同文件） |
| 旧数据迁移 | **不自动搬移**：新模型默认目录切部门级，旧 `{root}/{agent_id}` 目录保留（README 标注手动迁移）；`agents.workspace_path` 弃用（列保留、解析不再使用） |
| 单聊（is_dm=true） | **部门特例——同样有工作目录/沙盒**（两人部门：用户 + AI；附件/产出闭环完整） |

---

## 二、现状审计

### 2.1 执行层基线（保留复用）

| 能力 | 位置 | 处置 |
|------|------|------|
| agent 级常驻容器 + 统一工具执行器（read/write/edit/grep/list_files/bash） | src/sandbox/docker.ts + tool-runner.js | 重构为纯执行器（容器名改 sandbox_id） |
| 资源限制（network none/512m/1cpu/pids/cap-drop ALL/非 root） | docker.ts | 保留 + env 化 + 配置快照 |
| 监控查询 + Admin 运维视图 | docker.ts + server.ts:931-966 + Admin.tsx | 保留 |
| 真 docker 集成测试 T6a/T6b/T7/T6c | test/sandbox.test.ts | 保留（断言随归属变更重写） |

### 2.2 归属链现状（升华前的错位）

```
现状：agent 持有 workspace（{root}/{agent_id}）→ agent 持有 sandbox（ap-sandbox-{agent_id}）
      部门只做消息路由（department_members）——不持有任何数据/资源
错位：多 agent 协作（runAllAgents 同部门并发）各写各的目录、各占各的容器——协作无共享状态
```

### 2.3 执行层问题（一级概念化同时修复）

| 级别 | 问题 | 证据 |
|------|------|------|
| **P0-1** | 执行中容器仍可被回收（touch 只在 exec 前，长任务 >600s 被杀） | docker.ts:286-288 |
| **P0-2** | ensure 并发竞态（同 key 并发 docker run → Conflict → rm -f 误删） | docker.ts:243-247 |
| **P0-3** | exec 超时只杀客户端，容器内进程成孤儿 | docker.ts:352-354 |
| **P1-4** | agent 删除不联动（disposeAgent 死代码；workspace 永不清理） | routes/agents.ts:252 |
| **P1-5** | stopped 容器不自愈（ps -a 含 stopped） | docker.ts:119 |
| **P1-6** | 镜像/网络漂移不校验 | docker.ts:120-130 |
| **P2-7** | `SANDBOX_MODE=ephemeral` 死代码 | docker.ts:399 |
| **P2-8** | 无池内存预算/寿命上限/压力告警 | docker.ts:222-224 |
| **P3-9** | 每次工具调用 4-5 次 docker CLI | docker.ts ensure→probe→ready |
| **P3-10** | sandboxCalls 指标死指标 | server.ts:47 |

---

## 三、一级概念设计（绑定部门）

### 3.1 数据模型

```sql
-- departments 升华（增量列）
ALTER TABLE departments ADD COLUMN IF NOT EXISTS workspace_path TEXT;   -- 自定义工作目录（默认 {root}/{id}）
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_workspace BOOLEAN NOT NULL DEFAULT TRUE;  -- is_dm=true 的单聊自动 FALSE（无目录）

CREATE TABLE IF NOT EXISTS sandboxes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,                      -- 租户隔离
  department_id UUID,                            -- 绑定部门（核心归属；可空=独立沙盒）
  name        TEXT NOT NULL,                      -- 显示名（默认部门名）
  status      TEXT NOT NULL DEFAULT 'requested',  -- requested/running/stopped/terminated/error
  mode        TEXT NOT NULL DEFAULT 'persistent', -- persistent/ephemeral
  image       TEXT NOT NULL DEFAULT 'node:24',    -- 配置快照（漂移重建依据）
  network     BOOLEAN NOT NULL DEFAULT FALSE,
  memory_mb   INT NOT NULL DEFAULT 512,
  cpus        INT NOT NULL DEFAULT 1,
  error       TEXT,
  workspace   TEXT,                               -- 宿主 workspace 路径（卷挂载源）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                       -- heartbeat（DB 持久化）
  expires_at  TIMESTAMPTZ,                        -- 寿命上限
  terminated_at TIMESTAMPTZ
)
```

- 容器名 `ap-sandbox-{sandbox_id}`（UUID 前 12 位）——身份独立，不依赖 agent/部门存在
- **agent 不再绑定 sandbox/workspace**：agent 加入部门 = 获得该部门目录/环境；退出 = 失去。删除 agent 只清自身（记忆/日志），不级联目录/环境

### 3.2 生命周期状态机（两级回收，DB 驱动）

```
requested（记录已建，容器未起——惰性）
  → provisioning → running ⇄ stopped（idle 10min 自动 stop——瞬态保留、恢复快）
       ↓ 创建/启动失败                    ↓ 停止超 24h / 手动终止 / 部门删除级联
     error（错误持久化，可重试）          terminated（容器 rm，记录保留 30 天）
```

### 3.3 服务层（`src/sandbox/manager.ts` —— SandboxManager）

```
SandboxManager（唯一事实源：DB）
  ├─ 业务入口：runTool(departmentId, ws, tool, args)  → 查/建 sandbox 记录 → ensure → exec
  │           create / terminate / start / stop / restart / updateConfig
  ├─ 后台 reconcile（60s）：DB 期望 vs docker 实际对齐
  │     缺容器→重建｜停着→start（P1-5 自愈）｜漂移（挂载/镜像/网络）→重建（P1-6）
  │     idle→stop｜停止超时→terminate｜超龄（expires_at）→重建｜孤儿（DB 无记录）→rm
  ├─ 启动恢复：首轮 reconcile 恢复全部状态（不「全 rm 重来」）
  └─ DockerSandbox（纯执行器——无生命周期状态）：
        busy 豁免（exec 期间不回收/不驱逐，P0-1）
        ensure inflight 去重（P0-2）｜容器内 timeout 35s 杀进程树（P0-3）
        per-sandbox exec 串行队列（并发工具调用排队——部门共享环境的代价）
```

### 3.4 工具执行路径（升华后）

```
聊天 @agent（部门 D）
→ agent-runner config（已含 departmentId——注入点存在）
→ resolveDepartmentWorkspace(D)：departments.workspace_path 自定义，否则 {root}/{D}/
→ manager.runTool(D, ws, tool, args)（sandbox 按 department_id 查/建）
→ docker exec ap-sandbox-{id} tool-runner.js（cwd=/ws = 部门目录）
```

### 3.5 API

```
GET    /api/sandboxes?status=&department_id=&offset=&limit=   列表（app_id 隔离 + 部门名/agent 成员 join）
POST   /api/sandboxes           创建 { department_id?, name?, image?, network?, memory_mb? }
GET    /api/sandboxes/:id       详情（合并容器实际状态/资源）
PATCH  /api/sandboxes/:id       配置更新（→ 漂移重建）
POST   /api/sandboxes/:id/start | /stop | /restart | /terminate
GET    /api/sandboxes/:id/processes | /stats

GET    /api/departments/:id/workspace/list?path=   文件浏览器（从 /api/agents/:id/workspace 迁移）
GET    /api/departments/:id/workspace/file?path=
PUT    /api/departments/:id/workspace/file
```
权限：owner/admin 管理 sandbox；部门成员（含用户侧可见性）访问部门 workspace。审计：sandbox_create/config_change/terminate + department_workspace 事件。

### 3.6 配额与资源预算

- per-app sandbox 配额：`_weifuwu_apps.sandbox_quota`（默认 5）——创建校验，超限 409
- 池内存预算 `SANDBOX_POOL_BUDGET_MB`（默认 10240）——超 → 驱逐非 busy 最旧 → 仍超 → 明确错误
- 压力告警 ≥80%：warn 日志 + ops 状态 + Admin 黄条
- 单容器资源 env 化 + 创建快照（配置即声明）

### 3.7 诚实裁剪

| 裁剪项 | 决策 |
|--------|------|
| ephemeral | per-sandbox `mode` 字段落地（每次调用 `docker run --rm -i`，跳过池/回收） |
| 旧数据迁移 | 不搬移：旧 agent 目录保留，新目录部门级（README 标注）；agents.workspace_path 弃用 |
| 单聊 | 无工作目录/无 sandbox（需求出现再加） |
| per-agent 资源档位 | 登记后续项（第一版 env 全局） |
| gVisor | 已登记不实现 |
| 多进程 heartbeat | DB 驱动天然支持（Redis 裁剪项消除） |

---

## 四、任务清单（红→绿逐项验证）

### M0 部门升华（地基——workspace 归属切换）

- [ ] **M0-1. departments 表升华** — workspace_path/is_workspace 列 + `resolveDepartmentWorkspace`（替代 resolveAgentWorkspace——3 处调用点：agent-runner:162 / chat.ts:628 / routes/workspace.ts:39 全部切换）
- [x] **M0-2. 工具执行路径切换** — agent-runner 注入 `departmentId → ws`；`createWorkspaceHandlers(departmentWs, allowCommandExec, departmentId, allowNetwork)`；单聊（is_dm）也是部门特例——同样有目录/沙盒
- [ ] **M0-3. 文件浏览器迁移** — `/api/departments/:id/workspace/*`（成员可见性：department_members join）+ UI 从 AgentDetail 迁到 DepartmentDetail
  - 测试 T-M0：① 部门解析：自定义路径/默认路径/单聊 null；② 同部门两个 agent 工具调用 → 同一目录（写 A 读 B 可见）；③ 文件浏览器部门隔离（非成员 403）

### M1 数据模型 + 执行器重构（P0 三件套）

- [ ] **M1-1. sandboxes 表** — schema.sql + server.ts 增量建表 + `_weifuwu_apps.sandbox_quota` 列
- [ ] **M1-2. DockerSandbox 纯执行器** — 移除 lastUsed/reaper/evict/cleanup；容器名 sandbox_id；busy 豁免（P0-1）；inflight 去重（P0-2）；容器内 timeout 35s（P0-3）；stopped 自愈（P1-5）；漂移校验（P1-6）；per-sandbox exec 串行队列
  - 测试 T-M1（真 docker）：并发 ensure 单容器 / 长 exec 不被回收 / 超时无孤儿 / stop 自愈 / 漂移重建 / 串行队列（并发调用按序完成）

### M2 服务层（SandboxManager）

- [ ] **M2-1. SandboxManager** — 状态机全路径 + 两级回收 + 超龄重建 + reconcile 60s + 启动恢复
- [ ] **M2-2. 部门联动** — 部门内成员 agent 启用文件工具 → 自动建 sandbox 记录（requested）；**部门删除 → 级联 terminate + workspace 目录清理**（保留期 `SANDBOX_WORKSPACE_RETENTION_DAYS` 默认 0）；agent 删除不再级联 sandbox（只退成员关系——天然，无需代码）
- [ ] **M2-3. 审计** — sandbox_* + department_workspace 接线
  - 测试 T-M2（真 docker）：状态机全路径 / 部门删除级联 / 模拟重启 reconcile 恢复 / 孤儿清理

### M3 API

- [ ] **M3-1. /api/sandboxes CRUD + 操作 + 进程/详情** — 租户隔离 + owner/admin 权限 + 配额 409
  - 测试 T-M3：CRUD 直测 + 隔离 + 权限 + 配额

### M4 UI

- [ ] **M4-1. Sandboxes 页面** — ui/pages/Sandboxes.tsx（与 Agents 同构：卡片/状态徽章/操作/配额用量）+ NAV「沙盒」+ 路由
- [ ] **M4-2. DepartmentDetail 升华** — 工作空间文件区块（迁移自 AgentDetail）+ 沙盒状态卡片（关联记录/资源/操作）
- [ ] **M4-3. AgentDetail 收敛** — 移除 workspace/沙盒区块（agent 纯能力化；保留 allow_file_tools 开关——联动提示「保存后部门将自动创建工作环境」）
  - 验收：agent-browser——沙盒页全流程 + 部门页文件浏览 + AI 对话写文件 → 部门文件浏览器可见（端到端闭环）

### M5 配额与资源预算

- [ ] **M5-1. per-app 配额**（创建校验 + 列表用量 + 超限提示）
- [ ] **M5-2. 池预算 + 压力告警**（明确错误不静默降级）
- [ ] **M5-3. 资源 env 化 + 快照**
  - 测试 T-M5：配额 409 / 预算错误 / env 断言

### M6 性能、可观测与收尾

- [ ] **M6-1. TTL 缓存**（probe/readiness——工具调用降为 1 次 exec）
- [ ] **M6-2. 指标接线**（sandboxCalls 修复 + 状态计数 gauge + 操作计数）
- [ ] **M6-3. ephemeral 落地**（per-sandbox mode）
- [ ] **M6-4. 回归 + 文档** — test/sandbox.test.ts + workspace.test.ts 重写对齐新归属（CS-06）；全量测试 + tsc；README 三层模型章节（目录/资源/能力 + 状态机图 + API + 配额 + 迁移说明）；SANDBOX-PLAN.md 决策记录追加

---

## 五、验收方法（agent-browser + 真容器）

```
M0: 同部门双 agent 写同一目录互见 / 单聊无目录 / 文件浏览器部门隔离 ✓
M1: 并发 ensure 单容器 / 长 exec 不回收 / 超时无孤儿 / stop 自愈 / 漂移重建 ✓
M2: 状态机全路径 + 部门删除级联 + 重启恢复 + 孤儿清理 ✓
M3: CRUD + 隔离 + 权限 + 配额 409 ✓
M4: 沙盒页全流程（浏览器）+ 部门文件浏览 + AI 写→用户看闭环 ✓
M5: 配额/预算/压力告警 ✓
M6: 指标递增 + ephemeral 调用即焚 + 全量测试全绿（≤15s）+ tsc 零错误 ✓
```

## 六、决策记录

1. **三层归属链：部门持目录，目录持环境，agent 只持能力**——OS 类比（目录/进程/程序），多 agent 协作共享状态自洽（修正 SANDBOX-PLAN 4.1 的粒度纠结）
2. **sandbox 绑定 department_id（1 部门 = 1 目录 = 1 环境）**；独立 sandbox（department_id 空）保留——单聊/临时场景可手动创建
3. **并发共享环境的代价 = per-sandbox exec 串行队列**——正确性优先，AI 间歇调用实际影响小；文件原子写 + 文档红线兜底
4. **不搬移旧数据**：升级后 AI 工作目录切部门级，旧 agent 目录保留（README 标注）——诚实迁移，不搞后台搬运
5. **agent 删除不再级联 sandbox/workspace**（归属已移部门）；部门删除才级联——联动语义随归属链修正
6. **单聊 = 部门特例，同样有工作目录/沙盒**（2026-12 修订：单聊即两人部门——附件 AI 可见、产出可下载，日常体验闭环；沙盒两级回收 + 配额自动控制资源）
7. **执行器纯化 + DB 单一事实源**——回收/驱逐/恢复全部 DB 驱动，重启不失忆，多进程部署天然支持
8. **回收/驱逐永不杀 busy 容器**——任务完整性 > 池吞吐；池满返回明确错误
