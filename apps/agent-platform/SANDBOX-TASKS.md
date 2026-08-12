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
- [ ] **D1.** README/AGENTS 沙盒架构 + 残余风险 + 诚实裁剪
- [ ] **X1.** gVisor（runsc）强化登记（不实现）

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
