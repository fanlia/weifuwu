# Agent 沙盒执行环境方案（Docker node:24）

> 现状审计 → 架构方案讨论 → 安全边界 → 任务清单
> 背景：agent 可启用文件工具（read/write/edit/grep/list_files）与命令执行（bash）。当前 bash 在**宿主进程**直接 exec——安全边界不足。

## 一、现状审计（风险基线，实测）

### 1.1 当前实现
- 文件工具：`node:fs/promises` 宿主直接操作，限制在 `workspace_path` 内（`../` 穿越防护）
- bash：`node:child_process.exec` 宿主执行，防御仅靠高危命令黑名单（6 条正则）+ 30s 超时 + 100KB 输出限制

### 1.2 实测风险（真实可绕过）
```
⚠️ 放行  Sudo rm -rf /            （大小写绕过 /^sudo\s/）
⚠️ 放行  echo x | sudo tee /etc/passwd  （管道间接提权写）
⚠️ 放行  python3 -c "os.system('rm -rf /')"  （解释器间接执行）
⚠️ 放行  rm -rf /                  （黑名单根本没有）
```
- **命令执行 = 宿主 root 权限**（服务进程用户 x，但容器内是同一宿主）——AI 一旦被提示词注入即可删库/读密/扫内网
- 资源无限制：fork 炸弹/内存耗尽可拖垮整个服务
- 网络无限制：bash 可访问内网（SSRF——云元数据 169.254.169.254、内网扫描）

### 1.3 环境基线（本机实测）
- docker 29.7.2 + socket 可访问 ✓；`node:24` 镜像已存在 ✓（另有 node:26-alpine）

## 二、架构方案讨论

### 2.1 三种模式对比

| 维度 | 模式 A：每次调用一次性容器 | 模式 B：每 agent 长驻会话容器 | 模式 C：混合（文件宿主 + bash 容器） |
|------|--------------------------|------------------------------|-------------------------------------|
| 隔离 | 最彻底（无状态残留） | 好（会话保持） | 好（bash 隔离，文件受控） |
| 延迟 | 每次 ~200-500ms（镜像已拉取） | 首次启动后 ~20ms（docker exec） | 仅 bash 有延迟 |
| 状态保持 | 无（cd/后台进程/环境不保留） | 完整（工作目录/环境/后台进程） | 文件落盘共享（卷挂载） |
| 生命周期 | 无泄漏风险 | 容器泄漏/僵尸进程风险 | 无 |
| 并发 | 天然隔离 | 需锁/串行化 | 天然隔离 |
| 适用 | 独立命令（AI 每步完整命令） | 多步编译/长任务 | **务实折中** |

### 2.2 决策：模式 C（推荐）+ 可升级

**第一版：bash 工具容器化（--network none + 资源限制），文件工具保持宿主（已有路径穿越防护）。**
理由：
- 最大风险是 bash（实测黑名单可绕过 + 宿主权限）——先堵最大的洞
- read/write 已有 `../` 穿越防护 + workspace 范围限制，且是数据面（AI 读写的是租户自己的 workspace）；bash 是控制面（命令执行）——控制面必须强隔离
- 文件工具全容器化每次 fs 操作往返容器，性能与复杂度不成比例（后续 F1 评估）

**升级路径**（需求出现时）：模式 A 化（全部工具走容器）或会话容器化（长任务）。

### 2.3 容器执行细节（`docker run --rm` 一次性）

```
docker run --rm -i \
  --network none \                  # 网络隔离（防 SSRF/内网/云元数据）
  -v {workspace}:/ws:rw \           # 只挂 workspace（防读宿主文件）
  -w /ws \
  --memory 512m --memory-swap 512m \  # 内存上限（防 OOM 拖垮宿主）
  --cpus 1 \                        # CPU 上限
  --pids-limit 256 \                # 防 fork 炸弹
  --ulimit nofile=1024:1024 \       # 文件描述符上限
  --user node \                     # 非 root 运行（node 镜像自带 node 用户）
  node:24 bash -c "{command}"
```

关键点：
- **`--network none`**：默认无网络。需要下载依赖的场景（npm install）可配置 `allow_network` 开关 → 换 `--network bridge`（仍无内网代理保护——文档标注限制）
- **`--user node`**：非 root——容器内即使提权也受限于镜像+无 docker.sock
- **卷只挂 workspace**：容器内看不到 /、/etc/passwd、宿主任意路径——read/write 即使逃逸路径校验也够不到宿主
- **超时**：`timeout 30s`（容器内）+ 外层 `docker run` 超时兜底
- **输出**：100KB 截断（沿用现有）

### 2.4 回退与诚实裁剪（CS-05）

- **docker 不可用**（CI/无 docker 环境）：bash 工具返回明确错误「沙盒不可用——命令执行已禁用」，**绝不静默回退宿主执行**（回退宿主 = 把最大风险又带回来）
- 镜像不存在：首次执行自动 `docker pull node:24`（带状态提示）；拉取失败 → 同上禁用
- `--network none` 下网络类命令（curl/npm）失败——这是**设计而非缺陷**——UI/文档明确标注（诚实裁剪）
- 版本标注：沙盒要求 docker ≥ 20（`--pids-limit` 等参数兼容性）

### 2.5 残余风险（记录，不静默）

| 风险 | 等级 | 缓解/决策 |
|------|------|----------|
| 容器逃逸（内核漏洞） | 低 | 生产环境可选 gVisor（runsc）runtime——`SANDBOX_RUNTIME` env 支持，默认不启用（X1） |
| docker.sock 权限 | 中 | 服务进程需要 docker 权限——**这是信任边界**：拥有 docker 权限 ≈ 宿主权限，沙盒保护的是 **AI/租户** 而非系统管理员；文档明示 |
| workspace 自定义路径指向敏感目录 | 中 | 文件工具仍宿主执行（模式 C）——自定义 workspace_path 时管理员自担风险；沙盒内 bash 受卷挂载限制不受影响 |
| npm 下载供应链 | 低 | 默认 network none 阻断；开网开关由管理员决策 |

## 三、任务清单

### 阶段 1：沙盒执行层（P0）
- [ ] **S1. `src/sandbox/docker.ts`** — DockerSandbox 执行器（**agent 级常驻容器为主**）：
  - `ensure(agentId, ws)` → 容器存在且健康则复用，否则 `docker run -d --name ap-sandbox-{id} -v {ws}:/ws -w /ws --network none -m 512m --cpus 1 --pids-limit 256 -u node node:24 sleep infinity`
  - `exec(agentId, cmd)` → `docker exec ap-sandbox-{id} {cmd}`（~20-50ms）——工具调用主路径
  - `dispose(agentId)` → 空闲回收/agent 删除联动 `docker rm -f`
  - 孤儿清理：启动时扫描 `ap-sandbox-*` 全删（数据在卷，删除无损）
  - `SANDBOX_MODE=ephemeral` 备选：每次调用一次性容器（低资源环境）
- [ ] **S2. 可用性探测 + 镜像管理** — 启动时探测 docker 可用性 + node:24 存在性；首次调用自动 `docker pull node:24`（幂等）；状态注入 `ctx.sandboxStatus`（available / imageMissing / unavailable）；空闲回收定时器（LRU，10 分钟无调用 → dispose）
- [ ] **S3. 统一工具执行器（agent 的全部工具操作都在容器内）** — 容器内固定入口脚本 `/opt/tool-runner.js`（镜像构建内置或首次 exec 时写入卷），统一 JSON 协议：`echo '{"tool":"read","args":{"path":"x.ts"}}' | docker exec -i ap-sandbox-{id} node /opt/tool-runner.js` → 返回 JSON `{ok, output}`。**read/write/edit/grep/list_files/bash 全部经此入口**——agent 看到的是统一的容器内 /ws 文件系统视图（宿主路径 vs 容器路径无认知差异）
- [ ] **S4. 文件工具接入执行器** — `createWorkspaceHandlers` 的 read/write/edit/grep/list_files 改为走容器执行器（传工具名 + args）——路径穿越防护从「宿主代码」升级为「容器边界」（即使 resolveWorkspacePath 有 bug 也逃不出卷挂载）；安全 = 纵深防御
- [ ] **S5. bash 工具接入执行器** — bash handler 同样走容器（allow_command_exec 时）：`docker exec ap-sandbox-{id} bash -c "{command}"`；`SANDBOX_DISABLE=1` 或探测失败 → 返回「沙盒不可用，命令执行已禁用」（诚实裁剪）
- [ ] **S6. 资源限制落地** — 常驻容器创建参数：`--network none --memory 512m --cpus 1 --pids-limit 256 --user node --ulimit nofile`；`allow_network` agent 字段 → `--network bridge`；空闲回收定时器
- [ ] **S7. 输出/错误处理** — 容器退出码/JSON 解析；exitCode 非 0 → 错误消息含 stderr + 退出码；超时 → 「命令执行超时（30s）」（docker exec 外层 timeout 兜底）；OOM/pids 被 kill → 明确提示；输出截断 100KB（文件工具 50KB）

### 阶段 2：配置与 UI（P1）
- [ ] **U1. Agent 配置加「命令执行沙盒」说明** — allow_command_exec 的 hint 改为「在 Docker node:24 沙盒内执行（网络隔离、资源受限）——需服务端已安装 docker」
- [ ] **U2. AgentDetail 显示沙盒状态** — 「沙盒：Docker node:24 ✓（网络隔离 / 内存 512MB / 1 CPU）」或「沙盒不可用——命令执行已禁用」
- [ ] **U3. 可选 `allow_network` 字段** — agent 创建/编辑勾选「允许网络访问」（默认关——network none）；API + DB 列

### 阶段 3：测试与安全验证（P1，CS-04 真环境精神）
- [ ] **T1. 沙盒执行器测试** — docker 可用时真实容器集成测试（echo/exit code/超时/输出截断）；docker 不可用时回退逻辑（mock 探测失败 → bash 禁用）
- [ ] **T2. 逃逸尝试** — 容器内 `cat /etc/passwd`（宿主文件）→ 不存在；`ls /` → 只有容器根 + /ws；写 `/tmp` 不落宿主
- [ ] **T3. 资源限制** — fork 炸弹 `:(){ :|:& };:` → pids-limit 拦住（不拖垮宿主）；`yes` 无限输出 → 截断
- [ ] **T4. 网络隔离** — `curl http://169.254.169.254/`（云元数据）→ 失败；`curl http://localhost:3000`（本服务）→ 失败（network none）
- [ ] **T5. 现有回归** — app 81 测试全绿（无 docker 的 CI 环境 bash 返回禁用而非崩溃）；手动验证 AI 对话中 bash 工具调用（写文件 → 容器内读 → 宿主机可读——卷挂载双向）

### 阶段 4：文档与登记（P2）
- [ ] **D1. 文档** — apps/agent-platform/README + AGENTS.md 相关章节记录沙盒架构、残余风险表、诚实裁剪（network none 默认、docker 不可用禁用 bash）
- [ ] **X1. 可选强化登记** — `SANDBOX_RUNTIME=runsc`（gVisor）支持方案记录为后续项（不实现）

### 阶段 5：工作空间文件浏览器（P1——用户查看/编辑 agent 工作空间）

**背景**：沙盒让 AI 在容器内读写 workspace，但用户无法查看工作空间内容——需要文件浏览器组件。
组件库已有 Tree/Breadcrumb/CodeBlock/Editor/Table/FileUpload——**组装复用，不自研组件**。

#### 后端 API（复用 resolveWorkspacePath 路径穿越防护）
> 注：文件浏览器是**用户管理面**（用户查看自己的 workspace 状态）——宿主直接 fs 访问（非容器）。
> 与 agent 工具（容器内）看到的是**同一份数据**（容器卷挂载 = 宿主目录，双向可见）：AI 容器内写文件 → 用户浏览器立即可见 ✓
- [ ] **F1. `GET /api/agents/:id/workspace/list?path=`** — 列目录：名称/类型（dir/file）/大小/修改时间（排序：目录在前）
- [ ] **F2. `GET /api/agents/:id/workspace/file?path=`** — 读文件：文本截断 50KB；null 字节 → 「二进制文件不可预览」；超 200KB → 仅预览头部
- [ ] **F3. `PUT /api/agents/:id/workspace/file`** — 写文件（编辑保存）：body {path, content}；拒绝二进制（写 null 字节）；大小上限 500KB；租户隔离（agent 必须属于当前 tenant）
- [ ] **F4. 安全防线** — 租户隔离（WHERE id AND tenant_id）+ 路径穿越防护（复用 resolveWorkspacePath）+ 目录名防抖（禁止写 path 指向已存在目录）

#### 前端 UI（AgentDetail AI 分支「工作空间文件」卡片）
- [ ] **F5. 文件列表视图** — 面包屑（Breadcrumb）+ 文件行（Icon 区分目录/文件 + 名称 + 大小 + 时间 + 修改时间）；目录点击进入；空目录 EmptyState；刷新按钮；加载态
- [ ] **F6. 文件预览/编辑** — 点击文本文件 → 编辑区（CodeBlock 只读 or Textarea/Editor 编辑）+ 保存按钮（PUT）→ toast 保存结果；二进制/大文件只读提示；返回列表
- [ ] **F7. 与沙盒联动说明** — 卡片顶部标注「沙盒内 bash 写入的文件与此处一致（卷挂载共享）」——AI 写文件 → 刷新即可见；列表自动刷新（打开卡片时加载）

#### 测试（CS-04 真环境）
- [ ] **F8. API 测试** — list 空目录/嵌套/排序；read 文本/二进制/超限；write 保存/穿越拒绝/租户隔离（他人 agent 404）；API 直测 + app 测试
- [ ] **F9. 浏览器验收** — agent-browser：浏览目录 → 打开文件 → 编辑保存 → 刷新列表 → 用 AI bash 创建文件 → 文件浏览器可见（端到端：AI 写 → 用户看）

## 四、决策记录（讨论结论）

1. **模式 C**：bash 容器化 + 文件工具宿主（数据面/控制面分离——先堵最大风险）
2. **`--network none` 默认**：网络是隐藏的宿主暴露面（SSRF），默认关闭；`allow_network` 显式开启（管理员决策）
3. **非 root 容器用户**：`--user node`
4. **docker 不可用 → bash 禁用（不静默回退宿主）**：诚实裁剪
5. **全工具容器化（不只 bash）**：read/write/edit/grep/list_files/bash 全部经容器执行器——统一沙盒边界（agent 看到的是容器内 /ws 统一视图）+ 纵深防御（文件工具路径穿越即使有 bug 也逃不出卷挂载）
6. **docker.sock 权限是信任边界**：沙盒保护 AI/租户，文档明示不保护管理员
7. **文件浏览器**：浏览 + 编辑保存（读/写）为第一版；新建/删除暂缓（操作风险确认）——完整 CRUD 后续评估
8. **文件浏览器安全**：租户隔离 + 路径穿越防护复用；二进制/大文件只读；写操作限 500KB 文本
9. **组件复用**：Tree/Breadcrumb/CodeBlock/Editor/FileUpload 组装——不自研文件浏览器组件

### 4.1 容器粒度决策：每次调用一次性容器为主，升级路径 = agent 级长驻（不是用户/会话级）

**关键架构事实**（决定粒度）：
- workspace 按 **agent_id** 划分（`data/workspaces/{agent_id}/`）且**多会话共享**——部门会话里不同用户 @ 同一 agent 操作同一 workspace；文件是持久化状态（AI 写的代码 → 文件浏览器看）
- 一个会话消息可触发**多个 agent**（runAllAgents 遍历 @ 定向成员）

| 粒度 | 隔离 | 状态 | 生命周期 | 资源 | 适配 workspace | 结论 |
|------|------|------|---------|------|---------------|------|
| **每次调用一次性容器**（docker run --rm，实测 ~264ms） | 最彻底 | 状态在卷（workspace）——容器无状态是特性 | 无泄漏/无孤儿 | 峰值=并发调用数（低） | **完美**（卷挂载双向） | ✅ **默认** |
| 会话级长驻 | 会话间隔离 | 容器内状态保留（cd/env/后台进程） | 需超时回收/孤儿检测 | 并发会话数（中高） | ✗ **多会话并发写同一 workspace 冲突** + 一消息多 agent 无法归属 | ❌ |
| 用户/租户级长驻 | 同租户 agent 间**不隔离** | 同上 | 同上 | 在线用户数（高） | ✗ 跨 agent 污染（A agent 的 bash 能碰 B agent 的文件）+ 权限模型混乱 | ❌ |
| **agent 级长驻**（升级路径） | agent 间隔离 | 会话间共享（与 workspace 一致） | 删除 agent 时清理 + 空闲回收 | 启用 agent 数（中） | ✅ 1:1 卷挂载对齐 | 🔄 需求出现时升级 |

**推理链**：状态载体是 workspace（卷），不是容器 → 容器无状态（一次性）→ 会话级/用户级都解决不了「多会话共享同一 agent workspace」的并发语义，反而引入容器数量爆炸 + 生命周期复杂度 → 唯一有意义的升级粒度是 **agent 级长驻**（容器与卷 1:1，等价 GitHub Codespaces 一个仓库一个环境）。

**2026-08 修订：默认即 agent 级常驻容器**（用户确认方向）：全工具容器化后，一次性容器 264ms/工具调用 × AI 每轮 10-30 次调用 = 3-8s 附加延迟成为体验瓶颈——agent 级常驻（`docker exec` ~20-50ms）是正确默认。心智模型：**一个 agent = 一台开发机**（workspace 卷 + 常驻容器环境）。

**常驻容器实现要点**：
- 容器命名可推导：`ap-sandbox-{agent_id}`（前缀 + agent_id）——生命周期管理无需额外映射表
- `ensureContainer(agentId)`：存在且健康 → 复用；不存在 → `docker run -d --name ap-sandbox-{id} -v {ws}:/ws -w /ws --network none -m 512m --cpus 1 --pids-limit 256 -u node node:24 sleep infinity`
- 工具调用：`docker exec ap-sandbox-{id} node /opt/tool-runner.js <<< '{tool,args}'`（~20-50ms）
- 空闲回收：LRU + 定时器（10 分钟无调用 → `docker rm -f`）——常驻容器每个 ~50-100MB，回收防资源累积
- 孤儿清理：服务启动时 `docker ps -a --filter name=ap-sandbox-` → 全部 `docker rm -f`（容器无状态，删除无损——数据全在卷里）
- agent 删除联动：DELETE /api/agents/:id → 同步销毁容器
- **状态残留是副作用不是特性**：容器内环境变量/后台进程跨会话保留，但**不应依赖**（空闲回收/服务重启即丢）——文档明示；文件状态永远在卷（workspace）

**诚实裁剪**：`SANDBOX_MODE=ephemeral`（每次调用一次性容器）作为低资源环境备选配置；默认 `persistent`（agent 级常驻）。docker 不可用 → 工具禁用（不静默回退宿主）。

**升级触发条件**（当前不满足，记录）：AI 任务需要跨命令状态（长编译链/后台服务/npm install 后多次构建）且一次性容器往返延迟成为体验瓶颈时——实现 agent_id → container 映射 + 空闲回收（如 10 分钟无调用销毁）+ agent 删除联动清理。

**AI 适配性**：现代 AI 工具（Claude Code/Codex）都是无状态命令式（把 cd/export 写进命令）——一次性容器对 AI 完全友好，无需长驻状态的记忆依赖。

## 五、验收方法（agent-browser + 真容器）

```
S1: 服务启动 → 沙盒状态探测 ✓
S3: 对话「列出当前目录」→ bash 工具 → 容器内执行返回 workspace 内容 ✓
T2: AI 尝试读宿主 /etc/passwd → 容器内无该文件 ✓
T4: curl 云元数据 → 网络不可达 ✓
T3: 一次性 fork 炸弹 → 服务不卡（pids-limit 生效）✓
U2: AgentDetail 显示沙盒状态 ✓
T5: app 81 全绿 + 对话回归 ✓
F5: 文件浏览器列目录 → 进入子目录 → 面包屑导航 ✓
F6: 打开文件 → 编辑 → 保存 → toast ✓
F9: AI bash 创建文件 → 刷新文件浏览器可见（端到端闭环）✓
```
