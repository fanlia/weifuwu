---
name: weifuwu-dev
description: >
  Develop with the weifuwu framework (this repo): build components, pages, and
  full-stack apps using its own capabilities. Covers the five-step workflow
  (read → choose → write → verify → deliver), the content/ doc library, the
  examples/ app templates, test runbook, and human-quality delivery checklist.
  Use when writing or modifying weifuwu components/layout/apps, when answering
  "does weifuwu have X / how do I use Y", or when building an app on weifuwu.
---

# weifuwu-dev — 用 weifuwu 自己的能力开发

> 仓库内开发手册。**核心原则：先查框架再动手**——weifuwu 已提供的能力绝不重复造轮子；
> 展示平台（apps/showcase）自身全部由框架能力构成——那是活体参考实现。

## 五步工作流（读 → 选 → 写 → 验 → 交）

### ① 读——文档地图（三处同源：仓库 content/ = npm 包 content/ = showcase 平台）

```
content/index.md                 ← 起点（六域导航 + 组件速查）
content/components/<id>.md       ← 组件文档：API 表（AST 提取）+ 纪律 + 关系 + 验证
content/layout/*.md              ← 布局原语族（wf-*）
content/patterns/*.md            ← 页面模式（复制即用）
content/apps/*.md                ← 应用模板（todo/auth/admin/multi + agent-platform）
content/backend/*.md             ← 后端能力（ctx 注入链）
content/capabilities/*.md        ← 框架怎么工作
content/guides/*.md              ← 选型/质量标准/组件模型/生产级案例
```

人类阅读：`npx weifuwu docs` → http://localhost:4000（本地文档站）
活体验证：`node apps/showcase/server.ts` → http://localhost:3200（六域 + 活体 demo）

### ② 选——决策树（详见 content/guides/choose.md）

```
界面元素 → components 已有组件（135 个）→ 直接用
布局结构 → layout 原语（wf-* 类，零手写 CSS）
单页结构 → patterns/*.tsx 复制
多页应用 → examples/apps/<id>/ 复制改（todo/auth/admin/multi）
生产参考 → apps/agent-platform/
```

### ③ 写——关键纪律（完整版见仓库根 AGENTS.md——随开发完成后补充）

- 组件签名：`async (initProps, ctx) => async (props) => Promise<VNode>`（两阶段，renderFn 强制异步）
- 状态：普通对象 `let` + 改后 `ctx.ui.render()`（render-only——无隐式触发）
- 共享状态：`createStore` + `ctx.ui.useExternal(store)`（store.state.xxx）
- 浮层：必须组件 + `ctx.ui.usePopup`（portal 到 #__wf_portal——禁 absolute 定位）
- 受控组件：受控 props 必须配回调（缺回调 = 静默不可点）
- 浏览器能力：`ctx.browser`（禁裸 window/document/localStorage/matchMedia）
- ref：带清理逻辑的 ref 定义在 mount 作用域（内联 ref 每渲染触发 null）
- 列表：有状态组件 + 动态增删重排 → 显式 key；纯元素 → 无 key
- 图标：Icon 组件（禁裸文本字形 ✕✓⚠）；emoji 仅文案性 label 白名单

### ④ 验——验证金字塔

```
1. 单文件测试：timeout 15 node --env-file=.env --test --test-timeout=8000 <file>
   （组件测试用 weifuwu/ui-dom/testing 原语：renderVNode/mountComponent/findByClass）
2. 相关测试组：'src/test/vdom*.test.ts'（渲染引擎改动必跑）
3. 全量：npm test（发布前，≤15s 预算；--test-concurrency=8 已固化）
4. 浏览器走查：node apps/showcase/server.ts + agent-browser
   - 真实点击（CDP）+ eval click 都测（命中测试 vs 逻辑链路）
   - outerHTML / getAttribute('style') / getBoundingClientRect 三查
   - 浮层验证 closest('#__wf_portal')
   - 每次验证前 reload 清状态
5. 质量 checklist：content/guides/quality.md（交付前逐项）
```

### ⑤ 交——交付门槛

- [ ] 全量测试绿（`npm test` ≤15s）
- [ ] quality checklist 全过（键盘/三断点/主题/对比度/状态矩阵/性能/纪律）
- [ ] 组件新功能 → content/ 文档同步（新增组件走 scaffold——registry 自动登记）
- [ ] 实战先行：框架能力变更先在 apps/agent-platform 验证，再沉淀文档

## 新组件开发（scaffold）

```bash
node .pi/skills/weifuwu-dev/scripts/scaffold.mjs component <Name>
# 生成：src/components/<Name>/（.ts/.css/.test.ts）+ registry 自动登记 + demo 提示
```

产物后必做：
1. 补 demo：`apps/showcase/src/demos/<cat>.tsx`（按分类）+ 组件页活体自动出现
2. 跑 `node scripts/gen-content.mjs`（content/ 文档重新生成——防漂移测试驱动）
3. 单测三件套（props/状态/交互）+ style-audit 合规（对比度/动效/键盘）

## 常用命令速查

| 命令 | 用途 |
|------|------|
| `node apps/showcase/server.ts` | showcase 平台（:3200） |
| `node apps/components-demo/server.ts` | 组件走查面（:3100） |
| `npx weifuwu docs`（或 `node src/cli/docs.ts`） | 本地文档站（:4000） |
| `node scripts/gen-content.mjs`（`--check`） | content/ 文档生成（校验） |
| `node scripts/migrate-demos.mjs` | demo 迁移（components-demo → showcase） |
| `node scripts/build.mjs` | 构建 dist |
| `timeout 15 node --env-file=.env --test --test-timeout=8000 <file>` | 单文件测试 |
