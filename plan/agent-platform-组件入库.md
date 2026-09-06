# agent-platform 自建组件入库 —— weifuwu/components 全量收纳 + 平台零自建

> 目标：agent-platform 自建组件全部纳入 weifuwu/components——平台 components 目录消除、
> 零自建 style（组件样式 = 库 css 单源）。**探针实证**（/tmp/probe-plat-1.mjs）→ 甄别分层
> → 波次交付（每波独立可验收）。

## 探针实证（平台全景）

**平台 ui 目录**（38 文件）：components/ 10 文件（9 组件+聚合）· pages/ 19 · lib/ 10 · app.css 131 行。
所有组件 **weifuwu/vdom 自举**（jsxImportSource=weifuwu/vdom——h/JSX 同形态——**迁移零形态障碍**）。
依赖形态：`apps/agent-platform/node_modules/weifuwu → 根目录符号链接`——**dev 期 build 即生效**（零发布等待）。

## 甄别分层（迁移面 vs 判负面）

| 组件 | 规模 | 依赖 | 判定 |
| --- | --- | --- | --- |
| **CronPicker** | 37 行 · 纯 UI | weifuwu 组合（Input/select） | ⚠️ **迁①**（判负已推翻：用户指令 = 第二消费面确立——注释「第二个消费者出现再入」条件满足） |
| **ListScaffold** | 46 行 · 纯 UI | PageHeader/EmptyState/Loading 组合 | ⚠️ **迁②**（>1 消费者（Agents/Departments）——判负登记推翻） |
| **StatusDot**（ui.tsx 内 30 行） | 状态点原语 | Badge dot 组合 · 纯 UI | ⚠️ **迁③**（库无状态点原语——on/tone 契约单点） |
| **AppLayout** | 177 行 | auth/api 接线（**平台业务面**）· 壳面（品牌/菜单/徽标/抽屉） | ⚠️ **迁④（合并式）**：**库 AppShell 增强**（通用面全入）——平台接线（auth/admin/nav）留**装配层**（v3-main）——AppShell 注释已明「来源：AppLayout 沉淀」（第一代已入——**平台未切换**） |
| agent/FilesSection 等 **6 区块** | 322/234/45/65/127/68 | **服务端 API 绑定**（project-store/types） | ✅ 判负（业务区块——非 UI 组件——**推翻条件**：API 上抛成纯 props 展示后通用化） |
| project/MessageItem | 333 行 | **task-markers 服务端** · 已用库 MessageBubble | ✅ 判负（业务组装层——气泡渲染面库已有——**推翻条件**：task-markers 解耦注入） |
| ui.tsx 聚合器 | 68 行 | 转发 + **TYPE_META/TypeBadge/Ava**（业务元数据） | ✅ 消除对象（转发面随迁入改库直接引用——业务元数据留平台 lib） |
| errMsg | 8 行 | ApiError 平台错误面 | ✅ 判负（平台错误通道——非通用 utils 面） |

**迁移后平台形态**：`ui/components/` 目录**消除**——壳组装（auth/admin/nav）进 `v3-main.tsx`（装配层——AGENTS 装配域纪律对应）· 6 区块+MessageItem 移 `pages/blocks/`（区块语义——非组件）· 页面 import 全部 **weifuwu/components 直引**。

**样式面（用户核心要求）**：
- 迁③随组件入 css：CronPicker/ListScaffold/StatusDot **零新 css**（wf-row/wf-stack/布局类组合——**布局层单源**）
- AppShell 增强（badge/drawer）→ **AppShell.css 扩展**（库内单源——非平台样式）
- 平台 `app.css`：组件的 ap-* 样式（nav-badge/drawer/overlay——**迁入 AppShell.css**（ap- 前缀 → `wf-app-shell-*` 词根登记制）· 页面样式（ap-body/msg-actions——留平台——页面布局面）

## 波次计划

### W1 —— 库新增 3 组件（CronPicker · ListScaffold · StatusDot）

1. **三件套**（`src/client/components/<X>/`：ts（h() 化——库规范）+ css（最小/空）+ 契约测试）
2. **CronPicker**：库 Select（替换原生——统一表单面）· 契约（preset 与 server cron 解析器语义对齐——*/N · N-M · N,M 面）
3. **ListScaffold**：契约（loading/empty/isEmpty **矩阵**——空态显式（上次修的平台 bug 契约化）· toolbar 渲染面）
4. **StatusDot**：契约（tone 矩阵 · label 缺省只渲染点——语言化契约）
5. **showcase 注册**（registry + 每组件 demo 页）+ docs §2 清单 + index.ts 导出
6. 验收：契约 +3 · showcase +3 · 平台 492 不变（暂未切换）

### W2 —— Menu badge + AppShell 增强（AppLayout 功能面入库）

1. **Menu：MenuItem.badge**（导航徽标面——`badge?: string | number`——Badge 组件嵌入——库通用）
2. **AppShell 增强**：移动抽屉（ctx.ui.useBreakpoint——<768 抽屉 + overlay · useOpen 开关）· pending badge（Menu badge prop 走通）· **AppShell.css 扩展**（抽屉/overlay/badge——`wf-app-shell-*` 词根——ap-* 迁入改名）
3. **AppLayout 功能对照**（品牌/用户/设置退出——已有 ✓ · NAV match 面——AppShell activeOf 前缀匹配已覆盖（平台 NAV match 函数差异——**平台导航数据面**（v3-main 提供——match 进 nav item?——**AppShellNavItem 增强**（match 覆盖——或平台预处理——**W2 决定**）
4. 验收：AppShell 对照 AppLayout 功能全（除 auth/admin 接线）· showcase appshell 更新 · 契约 +2

### W3 —— 平台迁移（components 目录消除）

1. **v3-main 壳组装**（auth 守卫 · admin 判定 · NAV 数据 · AppShell 使用——装配层内联）
2. **12 页面 import 改直引**（ui.tsx 消除——ListScaffold/PageHeader 等改 `weifuwu/components`）
3. **区块移 pages/blocks/**（agent/* 6 + MessageItem——语义降级——引用更新）
4. **app.css 拆分**（组件样式迁 AppShell.css——页面样式留）
5. 验收：`ui/components/` 目录**空** · 平台 492 绿 · tsc 0 · **零自建 style**（app.css 仅页面面）

### W4 —— 全量回归 + 发布 + 归档

1. 全量门：契约（+5）· showcase（+3）· 场景 · server · 平台 492 · audit 全绿
2. **release v0.93.3**（平台 workspace 链接 build 即生效——发布供外部消费者）
3. docs §5 组件编写规范 + 入库流程（平台组件入库路径标准化）· AGENTS 快照
4. 计划归档

## 判负记录（探针实证——全部可推翻）

| 面 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| agent/* 6 区块 | 服务端 API 直接绑定（fetch/项目状态）——组件纯 UI 原则（零 fetch） | 区块 API 上抛 → 纯 props 展示（数据由页面注入） |
| MessageItem | 业务组装（task-markers 服务端检测 · 工具卡逻辑）——渲染面库 MessageBubble 已有 | task-markers 解耦为 props 注入面（消息类型通用化） |
| TYPE_META/TypeBadge/Ava | AGENT_TYPES 平台业务元数据（类型枚举平台面） | 类型枚举提为通用（第二产品域出现） |
| errMsg | ApiError 平台错误通道面（响应体 JSON 提取） | 错误面通用化（库 utils 需求出现） |
