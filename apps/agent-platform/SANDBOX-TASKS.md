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
- [ ] **U1.** allow_command_exec hint 改沙盒说明
- [ ] **U2.** AgentDetail 显示沙盒状态（Docker node:24 ✓ 网络隔离 / 不可用提示）
- [ ] **U3.** `allow_network` 字段（agent 创建/编辑勾选 + API + DB 列）

## 阶段 3：测试与安全验证（P1）
- [ ] **T1.** 执行器真容器测试（echo/exit code/超时/截断）+ docker 不可用回退（bash 禁用）
- [ ] **T2.** 逃逸尝试：`cat /etc/passwd` 无宿主文件；写 `/tmp` 不落宿主
- [ ] **T3.** 资源限制：fork 炸弹 pids-limit 拦住；`yes` 输出截断
- [ ] **T4.** 网络隔离：curl 云元数据/本服务均失败（network none）
- [ ] **T5.** 现有回归：app 81 全绿 + AI 对话 bash 工具调用（卷双向）
- [ ] **T6.** Heartbeat 生命周期：创建→touch→超时销毁→重建→孤儿清理
- [ ] **T7.** 池上限驱逐：MAX=2 → 第 3 个驱逐 LRU 最旧 → 重建无感 → 池恒 ≤ 上限

## 阶段 4：文档与登记（P2）
- [ ] **D1.** README/AGENTS 沙盒架构 + 残余风险 + 诚实裁剪
- [ ] **X1.** gVisor（runsc）强化登记（不实现）

## 阶段 5：工作空间文件浏览器（P1）
- [ ] **F1.** `GET /api/agents/:id/workspace/list?path=` 列目录
- [ ] **F2.** `GET /api/agents/:id/workspace/file?path=` 读文件（二进制/大文件只读）
- [ ] **F3.** `PUT /api/agents/:id/workspace/file` 写文件（500KB/拒二进制）
- [ ] **F4.** 安全防线：租户隔离 + 路径穿越防护 + 目录名防抖
- [ ] **F5.** UI 文件列表（Breadcrumb + Icon + EmptyState + 刷新）
- [ ] **F6.** UI 预览/编辑（CodeBlock/Textarea + 保存 toast）
- [ ] **F7.** 沙盒联动说明（AI 写 → 用户可见）
- [ ] **F8.** API 测试（list/read/write/穿越/租户隔离）
- [ ] **F9.** 浏览器验收（端到端：AI bash 写 → 文件浏览器看）

## 验收状态
| 项 | 状态 | 验证证据 |
|----|------|---------|
| （实施中） | | |
