# showcase 平台实施计划 — weifuwu 发展引擎

> 状态：**已确认，待实施**（2026-12 讨论定稿）
> 读者：框架开发者/贡献者
> 一句话：showcase = weifuwu 的发展引擎——实战驱动（agent-platform）→ 沉淀教学 → 文档随包 → 开发者/LLM 快速开发，闭环推动框架演进。

---

## 1. 背景与问题

| 现状 | 问题 |
|------|------|
| `apps/components-demo/` 单文件 `main.tsx` **3342 行**（135 DemoCard / 9 分组） | 超 LLM 上下文；无逐组件文档；无组件级 URL |
| `apps/layouts-demo/` 8 patterns | 无文档；未纳入统一平台 |
| `docs/` 15 文件（~6000 行） | 概要级，**无逐组件 API 文档**；页面/应用级空白 |
| npm 用户 | 无逐组件离线文档；无示例源码 |

## 2. 定位

**showcase = weifuwu 的发展引擎**（一个平台承载全部）：

```
实战驱动（引擎）                    沉淀教学（展示）
┌──────────────────────┐          ┌──────────────────────┐
│ agent-platform        │  提炼    │ showcase              │
│ 真实产品 → 暴露问题   │ ──────→  │ 文档/演示/模板/验证    │
│ → 框架迭代            │ ←──────  │ → 开发者学会最新实践   │
└──────────────────────┘  验证    └──────────────────────┘
```

- **开发纪律**：框架能力变更 → agent-platform 实战验证 → showcase 文档/模板跟进（内容不超前于实战）
- **用户分层**：LLM 是第一用户（read/curl），人类开发者第二（浏览器）；两份体验同一份内容
- **★ 自举纪律（硬约束）**：showcase 平台自身必须全部由 weifuwu 能力构成——路由用 createRouter、UI 用 components + layout 原语、状态用 createStore/render-only、弹窗用 usePopup、文档渲染用 Markdown 组件、docs 服务器用 serve + ctx.ui.ssr。**禁令**：自研组件/手写 CSS/第三方 UI 库/裸 DOM 全局一律禁止；唯一允许的外物是构建脚本（gen-content/extract-props，Node 标准库，不随包）。审计：showcase src 纳入浏览器纪律 grep 基线（§5.5）+ 自举映射自查表（§3.1）。

## 3. 总体架构

```
npm 用户（不 clone 仓库）
├─ LLM  → read node_modules/weifuwu/content/ + examples/    （零网络、版本锁定）
├─ 人类 → npx weifuwu docs → localhost:4000 文档站
仓库用户
├─ LLM  → skill + content/ + agent-browser（活体验证）
├─ 人类 → showcase 平台（活体 demo + 搜索 + 主题）
贡献者
└─ 双方 → scaffold + 防漂移测试 + 质量标准
```

### 内容分层（全站统一模板）

```
组件 → 原语族 → 页面模式 → 应用模板 → 后端能力 → 框架能力 → 指南
（每层：概述 / API / 代码 / 关系 / 纪律 / 文件位置 / 验证 —— 七节 .md 模板）
```

### LLM 完整旅程（全程 curl，零点击）

```
① 发现  curl /llms.txt（= content/index.md）
② 定位  curl /api/index.json（五表 + 关系图字段，可遍历）
③ 学习  curl /:domain/:id.md（七节模板）
④ 取码  curl /src/...（text/plain 全量）
⑤ 关系  index.json fields（uses/usedIn/usesPatterns）
⑥ 纪律  guides/*.md 全文
⑦ 验证  agent-browser open /:domain/:id（活体走查）
```

## 4. 目录安排（已确认）

```
weifuwu/（仓库根 = 发布根）
├── src/                    框架运行时（编译 → dist/）
│   └── cli/                ★ weifuwu docs（文档服务器，随包进 dist/cli/）
├── content/                ★ 文档库（根级 · 随包 · 平台 serve · LLM 直读）
│   ├── index.md · index.json
│   └── components/ layout/ patterns/ apps/ backend/ capabilities/ guides/
├── examples/               ★ 可复制示例源码（根级 · 随包）
│   ├── patterns/           ← 页面模式蓝本（自 layouts-demo 迁入）
│   ├── apps/               ← 应用模板 todo/auth/admin/multi（全栈）
│   └── backend/            ← 后端能力装配示例
├── docs/                   协议类保留（ai-contract/components-map/environment）
├── design/                 内部（不变）
├── apps/
│   ├── showcase/           ★ 发展引擎（六域 + registry + 活体 demo）
│   │   └── src/registry/   ★ 六表数据源（content/ 的生成输入）
│   └── agent-platform/     生产级参考（目录不动，showcase 展示层纳入）
├── scripts/                build / release / ★ gen-content.mjs / layout-inventory.mjs
└── bench/ dist/ test/
```

**原则**：
1. 发布内容与开发资产分离（随包 = dist/content/examples/docs/README）
2. content/ examples/ 放根级——仓库根 = 平台 serve 路径 = npm 包路径，零复制零漂移
3. 展示逻辑在 app（registry 在 showcase 内），发布内容在根
4. agent-platform 代码零耦合（独立部署形态），showcase 仅展示层纳入

## 5. 路由设计

### 页面路由（createRouter，pathname）

| 路径 | 页面 | 内容 |
|------|------|------|
| `/` | 首页 | 六域入口 + 计数（registry 计算）+ 快速开始四步走 |
| `/components` `/components/:category` | 组件总览/分类页 | 分类卡片网格（9 分类） |
| `/components/:category/:id` | 组件详情 | 活体 demo + 代码 + API 表 + 纪律 + 关系 + 验证 |
| `/layout` `/layout/:id` | 原语总览/族详情 | 16 原语族（色块可视化） |
| `/patterns` `/patterns/:id` | 模式总览/详情 | 预览 + 完整源码 + 结构说明 |
| `/apps` `/apps/:id` | 应用总览/详情 | **活体运行** + 路由表 + 文件清单 + 改造指南（+ agent-platform 生产级案例页） |
| `/backend` `/backend/:id` | 后端总览/详情 | 概念 + 装配代码 + 活体端点（curl/试一试） |
| `/capabilities` `/capabilities/:id` | 能力总览/详情 | 概念 + 平台自证 + 框架源码视图 |
| `/guides` `/guides/:id` | 指南总览/全文 | 学习路径/选型/质量标准/生产级案例 |
| `*` | 404 | 未匹配 + 六域回退 |

### 内容路由（server，curl/LLM 主路径）

```
/llms.txt                          全站索引（= content/index.md）
/api/index.json                    六表 + 关系字段
/:domain/:id.md                    每项 Markdown（扁平 id，不带 category）
/src/components/:name/:file        组件源码（.ts/.css/.test.ts）
/src/patterns/:name.tsx            模式完整文件
/api/apps/:id/files                应用文件清单
/src/apps/:id/*                    应用模板逐文件
/api/chat · /api/approve · /api/files/:name   wire-fake（保留）
/components.css                    样式（保留）
```

### id 命名约定

- components: 组件名 kebab-case（`button` `date-picker`）
- 分类: `form-core` `form-select` `form-advanced` `data-display` `data-feedback` `navigation` `ai-chat` `others` `new-batch`
- layout: 原语族（`grid` `stack` `nav-shell` `spacing` `responsive` `typography`…）
- patterns/apps/capabilities/guides: 英文 kebab，全局唯一
- **关键约定**：内容路由扁平化（`.md` 不带 category）——LLM 路径最短最可预测

## 6. 数据模型：registry（单一数据源）

`apps/showcase/src/registry/` 六表 + 关系字段：

| 表 | 条目 | 关键字段 |
|----|------|---------|
| components | 135 | id/name/category/desc/demo/code/sourceFile/testFile/cssFile/gotchas[] |
| primitives | ~16 族 | id/name/cssFile/demo（从 layout-inventory.mjs 清单生成，计数零漂移） |
| patterns | 12 | id/name/group/desc/comp/file/uses[]（组件反链） |
| apps | 5（4 模板 + agent-platform） | id/name/desc/routes[]/files[]/usesPatterns[]/quality |
| backend | 14（第一批 8） | id/name/middleware/endpoint/code/docsLink |
| capabilities | 12 | id/name/concept/srcFile/demo |

**关系原则：单向声明、反向自动推导**
- pattern 声明 `uses: ['Button',…]`；app 声明 `usesPatterns: […]`；backend 声明关联组件
- 反链（组件页"↑用于"、模式页"↑用于应用"）由生成器自动推导——杜绝手维护漂移

## 7. 文档体系

### 组件文档七节模板（content/components/:id.md）

```markdown
# Button · components
## 概述            — desc（registry 同源）
## API            — props 表：AST-lite 提取 XxxProps + 默认值（解构处）+ 注释
## 用法示例        — CODE 片段（现有字符串迁移）
## 纪律/坑         — AGENTS.md 事故记录按组件归类（人工补写，高价值部分）
## 关系            — usedIn: patterns/apps（JSON 同源）
## 文件位置        — Button.ts / .css / .test.ts / demo 文件
## 验证            — agent-browser 走查步骤
```

### props 提取策略（已确认：自研 AST-lite）

- 零新增依赖（typescript 不在 devDeps，不加）
- 规整 `interface XxxProps` 解析 95%+；**异常格式降级为"内嵌源码视图"**（诚实裁剪 CS-05）
- 实现：`scripts/extract-props.mjs`

### 内容来源策略

| 内容 | 来源 | 方式 |
|------|------|------|
| 概述/关系/文件位置 | registry | 脚本生成 |
| props 表 | 组件源码 | AST-lite 提取 |
| 用法示例 | CODE 字符串 | 机械迁移 |
| 纪律/坑 | AGENTS.md + design 事故记录 | 人工补写（先高频 40 组件，其余骨架兜底） |
| 验证步骤 | README 验证矩阵/走查记录 | 机械迁移 |

### docs/ 三类处理

| 类 | 文件 | 去向 |
|----|------|------|
| A. 合并进 showcase | frontend/server/data/realtime/saas/layout/styling/frontend-middleware/custom-components/components | 迁移进 content/guides + backend/capabilities 域——**按域渐进迁移，完成一个删一个，无双份维护窗口** |
| B. 保留 docs/ 独立 | ai-contract / components-map / environment / examples | 特殊视角，保留手工维护 |
| C. 生成 | components.md（789 行速查） | 内容并入逐组件文档 + 总览页后删除 |

### 随包发布（已确认）

- `package.json files: ['dist/', 'README.md', 'docs/', 'content/', 'examples/']`
- `exports` 增加 `./content` `./examples`（工具发现路径）
- release.mjs 校验：content/ 模板齐全、文件路径真实、链接有效、与 registry 同步
- **版本锁定**：包内文档永远匹配装的代码（npm 场景独有优势）

## 8. weifuwu docs CLI

```
npx weifuwu docs [--port 4000]   # → http://localhost:4000 本地文档站
```

- `package.json` 新增 `bin: { "weifuwu": "./dist/cli/docs.mjs" }`
- 服务器本身是一个 weifuwu 应用（Router + serve + ctx.ui.ssr）——"weifuwu 的文档服务器用 weifuwu 写"
- 路由：`/` 目录页 + `/components/:id` 渲染 HTML + `/raw/:domain/:id.md` 原始 Markdown + `/components.css`
- 渲染方案：`ctx.ui.ssr(Markdown, { content })`（先验证 Markdown 组件 SSR 安全性；fallback 复用 parser）
- **v1 静态文档站先交付；v2 完整平台入包（活体 demo）为后续**

## 9. 框架补丁（唯一前置）

**createRouter 隔离模式**（`src/ui-dom/vdom3/router.ts`）：

```ts
createRouter(routes, root, { history: false })
// 语义：不注册 popstate 监听；navigate 不碰 URL；初始路径 = initialPath ?? '/'
// 用途：页面内嵌子 router（app demo 活体运行）——防嵌套 router 互踩 popstate
// 默认 history: true 不变——现有调用零影响；带单测
```

这也是 capabilities/app-node 的自证素材。

## 10. 体验设计

### 人类质量标准 checklist（guides/quality.md，LLM 交付验收门槛）

```
□ 可访问性：键盘全程可达 / aria 语义 / 焦点可见
□ 响应式：375/768/1280 三断点无溢出、导航正确降级
□ 主题：亮/暗/自动三态适配、对比度 ≥4.5:1
□ 动效：--wf-dur/--wf-ease token、reduced-motion 降级
□ 状态完整：loading/error/empty/disabled 矩阵
□ 性能：首帧预算 + 虚拟列表（大数据）
□ 无控制台错误、无裸 window/document（ctx.browser 纪律）
```

### 体验承诺（可实测验收）

1. 任意层级 → 可运行代码 ≤2 次操作
2. LLM 从任务到交付：全部决策点有 .md 支撑，无"翻源码猜用法"断点
3. 人类与 LLM 看到同一份真相（content/ 同源、计数零漂移）
4. npm 用户：装包 → 读 content/index.md → 完成应用，全程无网络无仓库（端到端测试）
5. 复制即用：examples/ 每个模板独立可运行（发布前验证矩阵）

## 11. skill 设计（.pi/skills/weifuwu-dev/）

```
.pi/skills/weifuwu-dev/
├── SKILL.md                    ← 五步工作流入口（读→选→写→验→交）
├── references/
│   ├── choose.md               ← 选型决策树（对应平台 guides/choose）
│   ├── quality-checklist.md    ← 人类质量标准（对应 guides/quality）
│   ├── runbook.md              ← 开发循环 + 交付流程
│   ├── app-anatomy.md          ← 应用模板结构（改哪里）
│   └── framework-capabilities.md ← 12 项能力 → 源码位置 + 演示页 URL
└── scripts/
    ├── scaffold.mjs            ← 三档脚手架（组件/页面/应用：骨架 + registry + demo + 测试桩）
    └── verify.mjs              ← 质量自检（测试 + 计数/纪律扫描）
```

- 项目级 skill（跟随仓库，clone 即得）；文档地图指向 content/（包内优先）
- agent-platform 路径列入 references（"生产级参考：读 agent-platform 看真实用法"）

## 12. 阶段计划

| 阶段 | 内容 | 验收 |
|------|------|------|
| **P0 基础** ✅ | ① router 隔离模式补丁 + 测试 ② 根级 content/ examples/ 骨架 + registry 六表 + 关系字段 ③ gen-content.mjs 生成器 + 组件文档骨架（AST-lite props + 降级）④ 防漂移测试 ⑤ src/cli/docs 服务器 + bin + 测试 | 全量测试绿；curl /llms.txt、/api/index.json、/:domain/:id.md 可用；weifuwu docs 起站 |
| **P1 平台化** ✅ | showcase 六域路由 + shell（导航/主题）+ 组件/原语/页面级页面 + content/ 全量接线 + 表单核心分类活体 demo 接入（首批）+ wire-fake API 迁移 + patterns 迁入 examples/ | agent-browser 走查：六域导航/深链/搜索/主题；每组件页七节齐全；自举审计（grep：无裸 window/document、无手写 CSS）；style-audit/typecheck 全绿 |
| **P2 应用层** ✅ | 后端域 8 能力活体端点 ✅ + **4 全栈模板 ✅**（todo/auth/admin/multi——活体嵌入 + 共享 API 注册函数）+ demo 全量迁移 ✅（139 组件）+ 框架 bug 修复 ✅（v3Scheduler/ctx.ui.js alias）+ **待办（低优先）**：agent-platform 展示页细化 | 模板独立运行验证矩阵；curl 后端端点返回真实 JSON |
| **P3 体验贯通** 🔄 | guides 正文 ✅（start/choose/quality/component-model/render-only/production 6 篇全文）+ skill ✅（.pi/skills/weifuwu-dev：五步工作流 + scaffold 三档）+ 发布流水线 ✅（release.mjs：content/examples 校验 + gen-content --check + 覆盖硬门）+ README/AGENTS 更新 ✅ + **待办（低优先）**：verify.mjs 脚本、⌘K 搜索、事件流面板 | LLM 五步工作流端到端：装包 → 读 → 复制模板 → 验证 → 交付 |
| **P4 收尾** ✅ | docs 批量迁移 ✅（11 篇 → content/guides/）+ CODE 字符串迁移 ✅（code.ts 括号配对提取）+ **旧 apps 删除 ✅**（components-demo/layouts-demo——style-audit/typecheck 改 showcase 派生）+ **发布验证矩阵 ✅**（npm pack → 临时目录安装 → npx weifuwu docs 实测 200；bin shebang 修复） | 发布前全量绿；npm 包验证：content/examples 齐全、docs 命令可用 |

## 13. 已确认决策记录

- [x] content/ examples/ **根级**（非 apps 下）——零复制三处同源
- [x] agent-platform 目录不动，showcase **展示层纳入**（生产级案例页 + 架构提炼）
- [x] props 提取用**自研 AST-lite**（不加 typescript devDep；异常降级内嵌源码）
- [x] 文档渲染用 **ctx.ui.ssr(Markdown)**（框架自证）
- [x] `weifuwu docs` **v1 静态文档站先交付**，v2 平台入包后续
- [x] 人类质量标准 7 条先落地（可扩）
- [x] 应用模板第一批 4 个（todo/auth/admin/multi）
- [x] content/ + examples/ **随 npm 包发布**
- [x] 后端域第一批 8 个核心能力（server/middleware/sql/redis/ws/sse/ai/limit），第二批补齐 queue/cron/email/graphql/files
- [x] 纪律顺序：**实战先行（agent-platform）、文档跟进（showcase）**
- [x] **showcase 自举**：平台自身必须全部由 weifuwu 能力构成（禁自研组件/手写 CSS/第三方库/裸 DOM）；构建脚本为唯一外物
- [x] 组件文档人工补写先覆盖**高频 40 组件**，其余生成骨架 + 源码链接兜底

## 14. 风险与对策

| 风险 | 对策 |
|------|------|
| 中途失速烂尾 | 每阶段结束都是可用态（P0 即交付 curl 三端点 + docs 命令） |
| 新瓶装旧酒（只拆文件无内容） | 内容预算明确：人工补写纪律/坑按批次推进，防漂移测试硬门 |
| 迁移出错（style-audit 7 处依赖） | P0 同步改测试断言，全量绿才进 P1 |
| docs/ 迁移引用断裂 | 渐进按域迁移，每删一个文件同步改引用 + 链接完整性断言 |
| content/ 与源码双份漂移 | 生成器 + 防漂移测试（AST 对比、路径存在、模板齐全） |
