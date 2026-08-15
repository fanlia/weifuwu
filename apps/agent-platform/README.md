# apps/agent-platform — 多租户 AI Agent 平台

框架完整消费方（weifuwu 中间件全家桶 + 14 页 SPA）：
**认证（userSystem）/ AI 引擎（ai）/ 实时消息（messager）/ 数据库（postgres）/ 缓存广播（redis）/
限流（rateLimit）/ 权限（租户隔离）/ UI（ui-dom 14 页）** 全部框架能力，零自研替代。

## 商业化能力（2026-12 · v0.82.2）

完整商业化闭环（详见 [COMMERCIAL-PLAN.md](COMMERCIAL-PLAN.md)——G1-G15 全部实施）：

| 能力 | 说明 | 配置 |
|------|------|------|
| 订阅分层 | 免费版（14 天试用 + 5 万 token）/ Pro（100 万）——试用到期/配额用尽自动拦截 AI | 管理后台开通 |
| 租户管理后台 | 管理员（ADMIN_EMAILS）查看全部租户用量、停用/启用、开通 Pro | `ADMIN_EMAILS` |
| 邀请机制 | owner 生成 7 天邀请链接，同事注册即加入 + 自动建 Agent | — |
| BYOK 自带模型 | 租户配置 OpenAI 兼容端点/Key/模型（企业模型自主） | Settings → 模型配置 |
| 审批邮件通知 | HITL 审批请求邮件推送给 owner（含摘要 + 审批链接） | SMTP/RESEND |
| 审计导出 | 审计日志 CSV 下载（合规数据可带走） | — |
| 知识库权限 | 部门成员管理权限闸门（防越权拉取知识库） | — |
| 外部 IM 接入 | Webhook 双向 + 企微/钉钉/飞书群机器人出站格式 | Agent 详情 |
| ROI 视图 | 本月 AI 节省估算（回复数 × 人工成本 − AI 成本） | Dashboard |
| 使用分析 | 平台概览（活跃租户/消息/AI 回复/成本） | 管理后台 |
| SSO | OIDC 授权码登录（无密码建号 + 自动加入租户） | `OIDC_*` |
| License | 私有化授权（社区版/企业授权/到期） | `LICENSE_KEY`/`LICENSE_TO` |
| 白标 | 品牌名/logo/主色注入 | `WHITE_LABEL_*` |
| 管理 API | 租户列表/用量（客户系统集成） | `MANAGEMENT_API_KEY` |

**私有化部署**：`LICENSE_KEY` + `WHITE_LABEL_*` + `OIDC_*` + Dockerfile——一套配置交付品牌化企业实例。

## 启动

```bash
# 依赖：本地 postgres（DATABASE_URL）+ 可选 redis（REDIS_URL，多实例广播）
# AI：DEEPSEEK_API_KEY（对话）/ DASHSCOPE_API_KEY（embedding）
cp .env.example .env && vim .env
cd apps/agent-platform
npm run dev        # node --watch server.ts → http://localhost:3000
```

首次启动自动：schema 迁移（CREATE IF NOT EXISTS 绝不 DROP）→ 用户表迁移 → 内置工具注册 → 启动。

## 沙盒执行环境（三层模型：部门 = 工作目录 · sandbox = 计算资源 · agent = 能力）

> **2026-12 用户决策**：sandbox 与 agents 平级，成为**一级概念**——独立 DB 对象（`sandboxes` 表）、CRUD API（`/api/sandboxes`）、管理 UI（「沙盒」页）、审计、租户配额。归属链：**一个群聊部门 = 一个共享工作目录 + 一个沙盒环境**——部门内所有 Agent 的工具（read/write/edit/grep/list_files/bash）都在该环境执行。

```
宿主 data/workspaces/{department_id}/ ← 状态真相源（卷，双向挂载——单聊也是部门特例，同样有目录）
        ↓ bind mount
常驻容器 ap-sandbox-{sandbox_id}（--network none · 内存 512MB · 1 CPU · pids 256 · 非 root node 用户）
        ↓ docker exec（per-sandbox 串行队列）
统一工具执行器 /opt/sandbox/tool-runner.js（stdin {tool,args} → stdout {ok,output}）
```

**浏览器技能（agent-browser 内置）**：沙盒镜像含 agent-browser CLI + Chromium——
AI 可真实浏览网页（open/read/snapshot/screenshot）。容器自动 --no-sandbox；
需 Agent 开启 allow_network（同时容器提额 1G/2CPU——chromium 内存需求）。

**Python/Office 环境（用户决策 2026-12）**：不预制 Office 技能套装——沙盒内置 python3 +
预装库（openpyxl/pandas/pypdf/python-docx/python-pptx），AI 按需写脚本处理
Excel/Word/PDF/PPT；需要其他库时 `pip install --break-system-packages`（需网络权限）。
镜像：`docker build -f Dockerfile.sandbox -t ap-sandbox:latest .` + `SANDBOX_IMAGE`。

**生命周期（DB 驱动状态机——重启可恢复）**：
```
requested（记录已建，容器未起——惰性）→ running ⇄ stopped → terminated；error（错误持久化）
```
- **惰性创建**：部门内 Agent 首次使用工具时自动建记录 + 起容器；也可在沙盒页/部门页手动创建
- **两级回收**：空闲 `SANDBOX_IDLE_TIMEOUT`（默认 600s）→ `docker stop`（瞬态保留、恢复快）；
  停止超 `SANDBOX_STOP_TIMEOUT`（默认 24h）→ `terminate`（释放磁盘，记录保留 30 天）
- **超龄重建**：`SANDBOX_MAX_LIFETIME`（默认 24h）——清瞬态残留（「瞬态是副作用」的执行保证）
- **reconcile 60s**：DB 期望状态 vs docker 实际对齐——缺容器重建 / 停着自动 start / 配置漂移（镜像/网络/挂载）重建 / 孤儿容器清理
- **busy 豁免**：工具执行中的容器绝不回收/驱逐（长任务保护）；exec 超时容器内 `timeout` 杀进程树（无孤儿进程）
- **执行安全**：并发 ensure 去重（10 并发同部门 → 1 容器）；stopped 自动 start 自愈；per-sandbox exec 串行队列
- 服务启动首轮 reconcile 恢复全部状态（不「全 rm 重来」）

**配额与资源**：per-app `sandbox_quota`（`_weifuwu_apps`，默认 5）——超限创建 409 明确报错；
列表页显示用量（`x / 配额`）+ ≥80% 压力黄条。池内存预算 `SANDBOX_POOL_BUDGET_MB`（默认 10240MB）——
超预算自动驱逐非 busy 最旧（LRU），仍超返回明确错误（不静默降级）；单容器资源默认
`SANDBOX_MEMORY_LIMIT`/`SANDBOX_CPU_LIMIT`（默认 512MB/1 CPU）——创建时快照（配置即声明，改配置 → 漂移重建）。

**诚实裁剪（CS-05）**：
- `--network none` 默认——npm install/curl 等网络命令失败是**设计**；Agent 配置「允许网络访问」→ `--network bridge`
- docker 不可用 / 镜像缺失 / `SANDBOX_DISABLE=1` → 工具返回「沙盒不可用，命令执行已禁用」——**绝不静默回退宿主执行**
- 容器内文件操作限制在 `/ws`（卷）——路径穿越/资源/网络均受容器边界保护
- 单聊（is_dm）也是部门特例——同样有工作目录/沙盒（两人部门：用户 + AI）；旧 `{root}/{agent_id}` 目录不迁移（新模型切部门级，旧数据保留可手动搬移）
- `SANDBOX_MODE=ephemeral` 记录级 mode（一次性容器——调用即焚、卷持久；低资源环境备选）

**残余风险**（记录，不静默）：docker.sock 权限是信任边界（沙盒保护 AI/租户而非管理员）；容器逃逸（内核漏洞）低概率——生产可选 gVisor（`SANDBOX_RUNTIME=runsc`，登记为后续强化项）；部门内 agent 互信（共享环境——一个 agent 的 bash 可触及其他成员文件，per-sandbox 串行队列缓解并发冲突）。

**工作空间文件浏览器**：DepartmentDetail「工作空间文件」卡片——列目录/打开/编辑/保存/上传/下载（用户管理面，宿主直接 fs，与沙盒卷同一份数据双向可见）：AI 容器内写文件 → 浏览器刷新即可见；用户放资料 → AI 下次 read 读到。**部门删除 → 沙盒终止 + 工作目录清理**（`SANDBOX_WORKSPACE_RETENTION_DAYS` 默认 0=立即删）。

## 架构

```
server.ts（中间件装配 + schema 迁移 + 优雅关闭）
├── src/middleware/   租户隔离（tenantId 注入）/ auth-payload / workspace
├── src/routes/       auth / companies / agents / departments / messages / knowledge / skills / role-templates / workspace（文件浏览器 API）/ sandboxes（沙盒 CRUD + 生命周期）
├── src/services/     chat（AI 对话 + HITL 审批）/ webhook / agent-runner / embedding / skills（热重载）
├── src/tools/        builtin 工具 + registry + workspace（文件操作）
├── src/sandbox/      manager.ts（生命周期状态机 + reconcile——DB 驱动）/ docker.ts（纯执行器）/ tool-runner.js（容器内统一工具）
├── src/sandbox/      docker.ts（常驻容器池：ensure/exec/heartbeat/池上限）+ tool-runner.js（容器内工具执行器）
├── src/ai/           协议类型
├── skills/builtin/   可发现技能（get-current-time / search-knowledge-base）
└── ui/               14 页 SPA（UIRouter + uiServe + 组件复用）
    ├── pages/        Login/Register/Dashboard/Agents/NewAgent/AgentDetail/Companies/NewCompany/
    │                 Departments/NewDepartment/DepartmentDetail/NewChat/Chat/Settings
    ├── components/   AppLayout（认证守卫 + 侧边栏）+ ui（页面基础件）
    └── lib/api.ts    fetch 封装（token 注入 + refresh 自动重试）
```

## 核心业务流

- **注册**：建租户 + 框架注册 + 默认 user Agent（`ctx.app.navigate` SPA 跳转）
- **部门**：公司下建部门（DM/群组）→ 成员管理 → 聊天入口
- **聊天**（`/chat/:id`）：ws 订阅房间（messager）→ 发消息 → 后端 agent 流式响应
  （`wf:step/token/tool_result/done/error` 协议）→ 前端累积渲染（消息气泡/工具卡/审批卡）
- **HITL 审批**：AI 草稿待批（`ai_draft`）→ 批准/拒绝 → `approve` 端点
- **技能**：skills/builtin 目录热重载（skill-watcher）→ 运行时发现/启用
- **Webhook Agent**：`/api/webhook/:agentId`（签名校验）→ 消息处理

## 核心业务流（增强版，2026-12）

- **工作台**（`/`）：项目空间卡片列表（成员数/最近消息/活跃时间/环境状态点用户语言）+ 审批待办黄条 + 空状态三步引导（建项目→加 AI→放文件）
- **项目空间**（`/chat/:id` 三栏工作区）：左栏 AI 成员与状态（呼吸灯=干活中）+ 工作环境 · 中栏聊天流（头部环境状态 Badge）· 右栏交付物（共享目录实时刷新）
- **AI 协作闭环**：AI 调 write/edit 工具 → 聊天流「AI 刚生成了 X 下载 ↓」文件卡片 + 右栏自动刷新（file_updated WS 事件）
- **会话列表**（`/chat/new`）：最近会话（部门 + 最后消息 + 相对时间），点击直达
- **成员管理**（部门详情）：添加/移除成员（AI/Webhook/KB），创建后随时可改
- **组织层级**（department 类型 agent）：部门创建自动生成「部门经理」（代表部门对外协作——
  提示词含成员名单，可经 call_agent 分派成员干活）；经理可作为成员加入上级部门形成组织层级
  （如：技术部经理加入管理委员会）——被 @ 时代表子部门响应，委托链在子部门自己的工作目录执行
- **@ 定向发言**：`@Agent名 消息` → 只有被 @ 的 AI 回复；无 @ 全部 AI 回复（多 AI 群不刷屏）
- **审批待办**（`/approvals`）：管理员集中处理所有 HITL 草稿（批准/拒绝/去聊天）——审批权限仅部门管理员
- **运营报表**（`/reports`）：统计卡/趋势/成本排行/漏斗 + **部门维度用量看板**（消息·运行·Token·环境状态——三层模型计量单元）+ 配额告警黄条
- **沙盒管理**（`/sandboxes`）：环境生命周期管理（启动/停止/重启/终止）+ 配额用量 + 压力黄条
- **无 AI 成员提示**：群内无 AI 成员时发送自动插入系统提示（消除静默失败）
- **消息搜索 + 前滚分页**：聊天内全文搜索 + scroll 顶部加载更早
- **@ 补全浮层**：输入 @ 弹成员选择（ChatInput control 原语），选中后定向发送
- **注册引导**：无 AI 机器人时 Dashboard 显示「创建你的第一个 AI 同事」3 步引导
- **Webhook replay 防护**：X-Timestamp 签名 + 5 分钟新鲜度 + nonce 去重
- **模板运营位**：from-template 使用计数 + 🔥 热门标记（热门优先排序）
- **模板市场**（`/templates`）：角色模板分类浏览 + 一键创建（navigate query 驱动）
- **Agent 版本管理**：配置快照保存/列表/一键回滚（系统提示/模型/工具/配额）
- **Agent token 配额**：月 token 上限设置 + 用量展示 + 超限自动拦截（AI 暂停回复）
- **审计日志**：登录/Agent 变更记录（Settings 卡片 + /api/audit）
- **留存报表**：近 14 天消息趋势 + 每日活跃 Agent 数（Dashboard）
- **深色模式**：Settings「外观」auto/light/dark（localStorage 持久化）
- **骨架屏**：Dashboard/Agents 加载骨架
- **可观测性**：结构化请求日志（JSON 行）+ /api/metrics（请求/错误/AI token/内存）+ 备份脚本 scripts/backup.sh
- **演示环境**：`node scripts/seed.mjs` 一键种子（admin@demo.com / admin123）
- **测试隔离**：`TEST_DATABASE_URL`（默认 demo_test 独立库）——测试不再清 demo 产品数据

## 验证记录（agent-browser 实测，2026-12）

| 场景 | 结果 |
|------|------|
| 注册 → 登录 → dashboard 跳转（ctx.app.navigate 修复后） | ✓ |
| 侧边栏导航（Menu onSelect → navigate） | ✓ |
| Dashboard 统计（StatCard 图标 SVG 化） | ✓ |
| Agents 列表 / 创建 Agent 表单 | ✓ |
| Chat 空态（EmptyState SVG） | ✓ |
| 导航图标（grid/cpu/briefcase/users/message + settings/log-out SVG） | ✓ |

## 已知修复记录（2026-12）

- **引擎契约缺口**：`ctx.app.navigate` 类型已声明但 serve/mount 未注入——全应用
  `ctx.app?.navigate()` 静默失效（注册成功不跳转根因）→ mount.ts 注入（browser.navigate）
- **Register 成功路径 `$.loading` 不复位**（navigate 失效时永久"注册中"）→ 防御修复
- **`ctx.ui.onUnmount` 缺失**（组件级卸载钩子——Chat 定时器/ws 退订双保险）→ 框架补
  实现 + 类型 + SSR shim
- **页面 renderFn 同步**（renderFn 强制异步后 11 页未同步——16 个存量 tsc 错误漂移）→
  批量 async 化 + **agent-platform 加入 apps-typecheck 门禁**（三 app 零错误防线）
- **emoji 装饰图标 → Icon 组件**（NAV/StatCard/EmptyState/小节标题/状态符号——label
  文案 emoji 保留白名单）
- **Chat 调试残留**（`__dbgMsgs` render 热路径日志）→ 删除；alert() → ctx.toast

## 测试

```bash
npm test        # test/*.test.ts（后端——auth/角色模板/skills/workspace/services/middleware/ai）
```

前端以 agent-browser 走查为防线（页面 JSX 测试需 esbuild 编译链路——诚实裁剪，未做）。
类型门禁：全量 `npm test` 含 apps-typecheck（三 app tsc 零错误）。
