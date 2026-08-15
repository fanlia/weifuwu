# Agent 沙盒执行环境 + 文件浏览器 — 任务清单

> 方案文档：`SANDBOX-PLAN.md`（含现状审计/架构讨论/决策记录）｜实施从阶段 1 开始，红→绿逐项验证

## 阶段 1：沙盒执行层（P0）
- [x] **S1. `src/sandbox/docker.ts`** — DockerSandbox 执行器（agent 级常驻容器池）：`ensure`/`exec`/`dispose`/`touch`/池上限 LRU/孤儿清理/`SANDBOX_MODE=ephemeral` 备选
- [x] **S2. 探测 + Heartbeat + 预热** — docker 可用性 + node:24 存在性探测（`ctx.sandboxStatus`）；`touch` heartbeat；60s 回收定时器（`SANDBOX_IDLE_TIMEOUT` 默认 600s）；惰性重建；池上限 `SANDBOX_MAX_CONTAINERS` 默认 20 + LRU 驱逐；预热可选
- [x] **S3. 统一工具执行器** — `src/sandbox/tool-runner.js`（容器内 `/opt/sandbox` 只读挂载）：stdin `{tool,args}` JSON → stdout `{ok,output}`；read/write/edit/grep/list_files/bash 全经此入口；提示词引导（/ws 唯一持久位置、网络隔离前置）
- [x] **S4. 文件工具接入执行器** — `createWorkspaceHandlers` 的 read/write/edit/grep/list_files 改走 `sandbox.runTool`（参数透传）——安全边界 = 容器（纵深防御）
- [x] **S5. bash 接入执行器** — bash handler 走容器 `docker exec bash -c`；`SANDBOX_DISABLE=1`/探测失败 → 「沙盒不可用，命令执行已禁用」
- [x] **S6. 资源限制** — `--network none -m 512m --cpus 1 --pids-limit 256 -u node --ulimit nofile`；`allow_network` → `--network bridge`
- [x] **S7. 输出/错误处理** — exitCode/stderr/超时 30s/OOM/截断（bash 100KB、文件 50KB）

## 阶段 2：配置与 UI（P1）
- [x] **U1.** allow_command_exec hint 改沙盒说明
- [x] **U2.** AgentDetail 显示沙盒状态（Docker node:24 ✓ 网络隔离 / 不可用提示）
- [x] **U3.** `allow_network` 字段（agent 创建/编辑勾选 + API + DB 列）

## 阶段 3：测试与安全验证（P1）
- [x] **T1.** 执行器真容器测试（echo/exit code/超时/截断）+ docker 不可用回退（bash 禁用）
- [x] **T2.** 逃逸尝试：`cat /etc/passwd`（容器内为镜像 passwd 非宿主）；路径穿越拒绝
- [x] **T3.** 资源限制：fork 炸弹 pids-limit 拦住（容器内）；输出截断
- [x] **T4.** 网络隔离：curl 云元数据 rc=7（network none）
- [x] **T5.** 现有回归：app 85 全绿 + AI 对话 write/read 工具调用（卷双向：容器写→宿主可见）
- [x] **T6.** Heartbeat 生命周期：test/sandbox.test.ts 集成测试（创建→touch→超时销毁→重建→孤儿清理）✓
- [x] **T7.** 池上限驱逐：test/sandbox.test.ts（MAX=2 → 第 3 个驱逐 LRU 最旧 → 重建无感 → 池恒 ≤ 上限）✓

## 阶段 4：文档与登记（P2）
- [x] **D1.** README 沙盒架构章节（常驻容器池/heartbeat/池上限/诚实裁剪/残余风险/文件浏览器联动）+ 架构树补 src/sandbox
- [x] **X1.** gVisor（runsc）强化登记：README 残余风险表「SANDBOX_RUNTIME=runsc 登记为后续强化项」（不实现）

## 阶段 5：工作空间文件浏览器（P1）
- [x] **F1.** `GET /api/agents/:id/workspace/list?path=` 列目录（名称/类型/大小/mtime，目录在前）
- [x] **F2.** `GET /api/agents/:id/workspace/file?path=` 读文件（null 字节→二进制标记；200KB 截断）
- [x] **F3.** `PUT /api/agents/:id/workspace/file` 写文件（500KB/拒二进制 null 字节）
- [x] **F4.** 安全防线：租户隔离（WHERE id AND tenant_id）+ 路径穿越防护 + 目录覆盖拒绝
- [x] **F5.** UI 文件列表（面包屑 + Icon folder/file-text + 大小/时间 + EmptyState + 刷新）
- [x] **F6.** UI 预览/编辑（textarea + 保存 toast + 返回列表）
- [x] **F7.** 沙盒联动说明（AI 写 → 用户可见）
- [x] **F8.** API 测试（test/workspace.test.ts 4 个：穿越防护/子目录/边界/前缀穿越拒绝）
- [x] **F9.** 浏览器验收（端到端：AI bash 容器内创建 report.txt → 文件浏览器可见）

## 验收状态
| 项 | 状态 | 验证证据 |
|----|------|---------|
| S1-S7 沙盒执行层 | ✅ | 真容器端到端（write/read/bash + 卷双向 + 网络隔离 + 穿越拒绝） |
| U1-U3 配置 UI | ✅ | 浏览器：沙盒状态说明 + allow_network 勾选渲染 |
| T1-T7 测试 | ✅ | sandbox.test.ts 4 个真 docker 集成测试全绿（T6 heartbeat/T7 池上限） |
| F1-F9 文件浏览器 | ✅ | API 实测 + 浏览器编辑保存 + AI bash 写→浏览器看闭环 |
| 回归 | ✅ | app 73 全绿 + tsc 零错误 |

## 实施中抓出的真实问题
1. **buildToolContext 默认 workspace 路径 bug**：只看自定义路径 → 默认目录工具不注册 → AI 无工具可用（对话实测）
2. **ensure 卷挂载校验**：agent 换 workspace 后容器仍挂旧路径（T6b/T7 测试抓出）→ 不匹配重建
3. **vdom 三元分支返回 Fragment 渲染空**（真实坑）：`{cond ? (<></>) : (<></>)}` 条件表达式分支返回 Fragment 时渲染结果为空——**用单 div 包裹替代 Fragment 解决**（文件浏览器编辑视图踩中——浏览器验证定位）

## 2026-12 三层模型 + 一级概念实施记录（SANDBOX-LIFECYCLE-PLAN.md）

### M0 部门升华（部门 = 工作目录）
- [x] **M0-1.** departments.workspace_path 列 + `resolveDepartmentWorkspace`（替代 resolveAgentWorkspace——3 处调用点全切换：agent-runner/chat.ts/routes/workspace.ts）
- [x] **M0-2.** 工具执行路径切换——buildToolContext 按部门解析（is_dm 拦截）+ createWorkspaceHandlers 归属部门
- [x] **M0-3.** 文件浏览器迁移 `/api/departments/:id/workspace/*`（原 agent 级）——UI 迁至 DepartmentDetail，AgentDetail 收敛为纯能力说明
- [x] 测试：test/workspace-department.test.ts（5 个：默认/自定义/禁用具/无部门/幂等）

### M1 数据模型 + 执行器重构（P0 三件套）
- [x] **M1-1.** sandboxes 表（schema.sql + server.ts 增量 + 部门部分唯一索引 + sandbox_quota 列）
- [x] **M1-2.** DockerSandbox 纯执行器（移除 lastUsed/reaper/evict/cleanup）——容器名 sandbox_id；busy 豁免（P0-1）；inflight 去重（P0-2）；容器内 timeout 杀树（P0-3）；stopped 自愈（P1-5）；漂移校验（P1-6）；exec 串行队列

### M2 服务层（SandboxManager——DB 驱动状态机）
- [x] **M2-1.** 状态机全路径 + 两级回收（idle→stop / 停止超时→terminate）+ 超龄重建 + reconcile 60s（对齐/孤儿清理/历史清理）+ 启动恢复
- [x] **M2-2.** 部门联动——runTool 自动建记录（requested 惰性）；**部门删除 → 级联 terminate + workspace 清理**（保留期 env）；agent 删除不再级联（归属已移部门）
- [x] **M2-3.** 审计接线（sandbox_create/config_change/start/stop/restart/terminate）
- [x] 测试：test/sandbox.test.ts 重写 9 个真 docker+真 postgres 集成测试（T-M1a~e / T-M2a~d）全绿

### M3 API
- [x] **M3-1.** /api/sandboxes CRUD + 生命周期操作 + 进程/资源 + 租户隔离（app_id）+ owner/admin 权限 + 配额 409 + 手动创建解析部门目录
- [x] 租户隔离审计登记（sandboxes 表 + manager 豁免——间接隔离/后台回收扫描/按主键更新）

### M4 UI
- [x] **M4-1.** Sandboxes 页（列表卡片/状态徽章/操作/镜像网络内存/容器状态）+ NAV「沙盒」+ 路由
- [x] **M4-2.** DepartmentDetail 升华——文件浏览器（部门级）+ 沙盒状态卡片（启动/停止/重启/终止）
- [x] **M4-3.** AgentDetail 收敛（纯能力化——文件工具说明指向部门工作空间）
- [x] 浏览器验收：登录 → 沙盒页列表（运行中/已终止状态正确）→ 部门页文件浏览器（API 写文件立即可见）→ 沙盒启动（容器 Up）→ 权限 403 正确

### 回归
- [x] 全量测试 152/152 全绿（排除既有环境问题的 test/ui/pages.test.ts——HEAD 同样失败）+ tsc 零错误
- [x] README 沙盒章节重写（三层模型/状态机/两级回收/env 表/裁剪/残余风险）

### 实施中抓出的真实问题
1. **manager.list 拼接 SQL 参数化陷阱**：conds.join 字符串被 sql 标签参数化 → `invalid input syntax for type boolean`——重构为显式分支 + 白名单校验
2. **容器内 timeout exit 137**：`timeout -s KILL` 杀进程组 → docker exec 返回 137（非 124）——137/124 均判定超时
3. **手动创建沙盒 workspace 为空**：routes 层补 resolveDepartmentWorkspace（部门目录解析）
4. **测试表外键**：_weifuwu_apps.owner_user_id 有外键 → 测试插入需真实用户 id
5. **pages.test.ts 既有环境问题**：jsx-runtime 解析失败（dist dev hooks 与 src paths 冲突）——HEAD 同样失败，非本次引入

## 2026-12 镜像切换：node:24 → ap-sandbox:latest（含 P0-3 孤儿进程根治）

- [x] **默认镜像切换**：docker.ts / manager.ts / schema.sql / server.ts 建表默认值 / 测试全部改 `ap-sandbox:latest`
  （agent-browser + python/office 预装库；存量记录快照 image='node:24' 不迁移——重建时按快照，兼容）
- [x] **ALTER COLUMN SET DEFAULT**（server.ts 增量）——新记录默认 ap-sandbox:latest
- [x] UI 文案更新（AgentDetail/NewAgent「ap-sandbox（node:24 + python + agent-browser）」）
- [x] 镜像能力冒烟：python-office-ok（openpyxl/pandas/pypdf/docx/pptx）+ agent-browser 0.34.0 ✓

### P0-3 孤儿进程根治（镜像切换暴露——node:24 下同样存在）
**事故**：`timeout -s KILL {secs} node tool-runner.js` 只杀 node——bash 的 `sh + sleep` 子进程成孤儿挂在容器主进程下继续跑（docker top 证实）。
**根因**：外层 timeout 杀不了 bash 进程树；且内部超时下限 Math.max(3, secs-2) 在 secs=3 时与外层同时触发（race）。
**修复**（tool-runner.js + docker.ts）：
1. bash 分支 `spawn(detached: true)` = 新进程组 → 超时 `kill(-pid, SIGKILL)` 杀整个组（sh + 全部后代）
2. 内部超时 = 外层（`docker exec -e SANDBOX_EXEC_TIMEOUT_SECS` 传入）− 2s（至少 1s 缓冲——严格小于外层，杜绝 race）
3. bash 超时 = 工具失败（`{__timeout}` → 抛错 → `{ok:false}`——AI 可感知重试）
4. main() 输出后 `process.exit(0)`（防 detached child stdio 挂住事件循环）
5. dockerExec 的 `-e` 参数移到容器名前（docker exec [OPTIONS] CONTAINER COMMAND 语法）
- 验证：T-M1c（sleep 60 → 超时 + docker top 无残留）✓ 9/9 集成测试全绿 + 全量 152/152

## 2026-12 M5/M6 实施记录（配额/预算/缓存/指标/ephemeral）

### M5 配额与资源预算
- [x] **M5-1. per-app 配额用量**——GET /api/sandboxes 响应加 `quota: {used, limit, pressure}`；Sandboxes 页显示「配额用量 x/5」+ ≥80% 压力黄条（创建校验 T-M2d 已有）
- [x] **M5-2. 池内存预算**——`SANDBOX_POOL_BUDGET_MB`（默认 10240=20×512MB；0=禁用）——create 时超预算 → **驱逐非 busy 最旧（LRU）** → 仍超 → 明确错误「沙盒池内存不足」（不静默降级）；构造参数 poolBudgetMb 可覆盖（测试用）；租户审计豁免登记（平台级聚合）
- [x] **M5-3. 资源 env 化 + 快照**——`SANDBOX_MEMORY_LIMIT`（默认 512）/`SANDBOX_CPU_LIMIT`（默认 1）——创建时快照进 memory_mb/cpus（配置即声明，改配置 → 漂移重建）

### M6 性能、可观测与收尾
- [x] **M6-1. TTL 缓存**——probe 成功 60s / 失败负缓存 10s；per-sandbox readiness 指纹缓存 30s（工具调用降为 1 次 exec）；**缓存自愈**：exec 'not running'（容器被外部 stop）→ 清缓存 → ensure（start）→ 重试一次（对工具透明）
- [x] **M6-2. 指标接线**——`sandboxCalls` 死指标修复（manager.runTool 入口自增）；manager.counters（created/terminated/evicted/idleStopped/autoStarted/orphansCleaned）+ 执行器 execStats（execCount/errors/timeouts）→ /api/metrics + /api/metrics/prom 全量暴露
- [x] **M6-3. ephemeral 落地**——per-sandbox `mode='ephemeral'`：每次调用独立容器（runOnce：docker run -d + exec + finally rm -f——调用即焚）；卷挂载共享（文件持久）；创建 API 支持 mode/memory_mb；reconcile 跳过 ephemeral
- [x] **M6-4. 回归**——11 个 sandbox 集成测试全绿 + 全量 154/154 + tsc 零错误；README/SANDBOX 文档更新

### 测试
- [x] T-M5-2（池预算：驱逐最旧生效 + 仍超抛错 + makeManager poolBudgetMb 转发）
- [x] T-M6-3（ephemeral：写读跨容器卷持久 + 无容器残留 + 状态标记 running）
- 实施中抓出的问题：模块级 DEFAULT_POOL_BUDGET_MB 固化 → 构造参数覆盖；readiness 缓存致 stopped 自愈失效 → 'not running' 重试自愈
