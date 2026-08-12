# apps/agent-platform — 多租户 AI Agent 平台

框架完整消费方（weifuwu 中间件全家桶 + 14 页 SPA）：
**认证（userSystem）/ AI 引擎（ai）/ 实时消息（messager）/ 数据库（postgres）/ 缓存广播（redis）/
限流（rateLimit）/ 权限（租户隔离）/ UI（ui-dom 14 页）** 全部框架能力，零自研替代。

## 启动

```bash
# 依赖：本地 postgres（DATABASE_URL）+ 可选 redis（REDIS_URL，多实例广播）
# AI：DEEPSEEK_API_KEY（对话）/ DASHSCOPE_API_KEY（embedding）
cp .env.example .env && vim .env
cd apps/agent-platform
npm run dev        # node --watch server.ts → http://localhost:3000
```

首次启动自动：schema 迁移（CREATE IF NOT EXISTS 绝不 DROP）→ 用户表迁移 → 内置工具注册 → 启动。

## 沙盒执行环境（Docker node:24）

启用文件工具（allow_file_tools）的 AI Agent，其 read/write/edit/grep/list_files/bash 工具**全部在 Docker 沙盒容器内执行**（安全边界 = 容器）：

```
宿主 data/workspaces/{agent_id}/ ← 状态真相源（卷，双向挂载）
        ↓ bind mount
常驻容器 ap-sandbox-{agent_id}（--network none · 内存 512MB · 1 CPU · pids 256 · 非 root node 用户）
        ↓ docker exec ~20-50ms
统一工具执行器 /opt/sandbox/tool-runner.js（stdin {tool,args} → stdout {ok,output}）
```

**生命周期（Heartbeat + 池上限）**：
- 每次工具调用 `touch`（记录最后使用）→ 60s 扫描，超 `SANDBOX_IDLE_TIMEOUT`（默认 600s）无操作自动销毁容器
- 池上限 `SANDBOX_MAX_CONTAINERS`（默认 20）——超限 LRU 驱逐最旧容器（即使刚用过也要让位）
- 销毁/驱逐后下次调用**惰性重建**（无感）——容器无状态，文件永远在卷，销毁仅失容器内瞬态（环境变量/后台进程）
- 服务启动清理孤儿容器（`ap-sandbox-*` 全删）；agent 删除联动销毁
- 备选：`SANDBOX_MODE=ephemeral`（每次调用一次性容器，低资源环境）

**诚实裁剪（CS-05）**：
- `--network none` 默认——npm install/curl 等网络命令失败是**设计**；Agent 配置「允许网络访问」→ `--network bridge`
- docker 不可用 / 镜像缺失 / `SANDBOX_DISABLE=1` → 工具返回「沙盒不可用，命令执行已禁用」——**绝不静默回退宿主执行**
- 容器内文件操作限制在 `/ws`（卷）——路径穿越/资源/网络均受容器边界保护

**残余风险**（记录，不静默）：docker.sock 权限是信任边界（沙盒保护 AI/租户而非管理员）；容器逃逸（内核漏洞）低概率——生产可选 gVisor（`SANDBOX_RUNTIME=runsc`，登记为后续强化项）；workspace 自定义路径指向敏感目录时管理员自担风险。

**工作空间文件浏览器**：AgentDetail「工作空间文件」卡片——列目录/打开/编辑/保存（用户管理面，宿主直接 fs，与沙盒卷同一份数据双向可见）：AI 容器内写文件 → 浏览器刷新即可见；用户编辑保存 → AI 下次 read 读到。

## 架构

```
server.ts（中间件装配 + schema 迁移 + 优雅关闭）
├── src/middleware/   租户隔离（tenantId 注入）/ auth-payload / workspace
├── src/routes/       auth / companies / agents / departments / messages / knowledge / skills / role-templates / workspace（文件浏览器 API）
├── src/services/     chat（AI 对话 + HITL 审批）/ webhook / agent-runner / embedding / skills（热重载）
├── src/tools/        builtin 工具 + registry + workspace（文件操作）
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

- **会话列表**（`/chat/new`）：最近会话（部门 + 最后消息 + 相对时间），点击直达
- **成员管理**（部门详情）：添加/移除成员（AI/Webhook/KB），创建后随时可改
- **@ 定向发言**：`@Agent名 消息` → 只有被 @ 的 AI 回复；无 @ 全部 AI 回复（多 AI 群不刷屏）
- **审批待办**（`/approvals`）：管理员集中处理所有 HITL 草稿（批准/拒绝/去聊天）——审批权限仅部门管理员
- **无 AI 成员提示**：群内无 AI 成员时发送自动插入系统提示（消除静默失败）
- **Dashboard 近 7 天消息趋势**：真实数据 CSS 柱条 + **Token 成本排行**（按 Agent）
- **消息搜索 + 前滚分页**：聊天内全文搜索 + scroll 顶部加载更早
- **@ 补全浮层**：输入 @ 弹成员选择（ChatInput control 原语），选中后定向发送
- **注册引导**：无 AI 机器人时 Dashboard 显示「创建你的第一个 AI 同事」3 步引导
- **Webhook replay 防护**：X-Timestamp 签名 + 5 分钟新鲜度 + nonce 去重
- **模板运营位**：from-template 使用计数 + 🔥 热门标记（热门优先排序）
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
