# apps/layouts-demo 优化计划 — 布局蓝本质量提升
> **状态（2026-12 确认）**：✅ 已完成——布局蓝本质量提升——复制即用规范达成

> 目标：让 `apps/layouts-demo` 成为"复制即用"的布局蓝本——开发者抄的每一行都是
> weifuwu/layout 原语 + weifuwu/components 组件的**规范用法**，且每个模式在真实
> 浏览器（agent-browser）下视觉/交互/响应式全部验证通过。
>
> **纪律（AGENTS.md §8 布局蓝本纪律）**：只使用 weifuwu/layout + weifuwu/components
> 能力，不自己写组件/样式；能力缺口 → 补到框架（绝不绕过）。
> **测试纪律（AGENTS.md 附录 A）**：agent-browser 验证真实 HTML——outerHTML +
> getComputedStyle + getBoundingClientRect + 真实点击/悬停，text 全对 ≠ 可见。

---

## 一、现状盘点（已完成，3 提交）

| 提交 | 内容 | 状态 |
|------|------|------|
| `6b845f9` | 8 布局模式蓝本（应用壳/文档站/仪表盘/分栏工作台/落地页/移动端/数据大屏/聚焦任务） | ✅ |
| `4201957` | 布局蓝本纪律落地——纯原语+组件重写（Icon 30→78 + wf-between + Card 透传） | ✅ |
| `c979b6a` | agent-browser 体检修复 4 问题（NavMenu 错用 / render CSS 变量静默失败 / wf-pin 原语 / 壳窄屏降级） | ✅ |

### 现有能力基线
- **模式**：8 个（`apps/layouts-demo/src/patterns/`），每文件独立可复制
- **壳**：左侧 wf-nav 模式列表 + hash 路由；窄屏（<1024）侧栏隐藏 + 顶部横向滚动切换
- **原语新增**：`wf-between`（两端对齐）、`wf-pin`（position:fixed 角标）
- **框架修复**：render.ts 支持 style 内 CSS 变量（`--wf-cols` 等，setProperty）
- **测试**：1778 全绿（含 render CSS 变量单测）

### 已知待优化（agent-browser 体检残留）
1. 模式内部交互偏静态（AppShell 侧栏不可折叠、Dashboard 切换无数据联动）
2. 壳无"查看代码"能力（开发者要开编辑器看源码，不够"参考"）
3. 模式列表无分组（8 个平铺，随新增会变长）
4. 部分模式残留允许类内联（可继续归拢到原语/组件）
5. 无多屏断点矩阵验证记录（1280/1024/768/375 各模式行为未系统记录）

---

## 二、优化项（分三阶段）

### Phase 1：模式交互深化（P0——每个模式"能点"）

| # | 模式 | 优化 | agent-browser 验收 |
|---|------|------|-------------------|
| 1.1 | AppShell | 侧栏折叠按钮（LayoutSider collapsible 或 wf-nav 折叠态） | 点击折叠钮 → 侧栏宽 240→64（数字动画）→ 再点展开；`getBoundingClientRect().width` 断言 |
| 1.2 | Dashboard | SegmentedControl 切换数据（7d/30d/90d 换 KPI 数值 + 表格） | 点"近 7 天" → KPI 值变化（textContent 断言 ≠ 30d 值）→ 表格行数/内容变化 |
| 1.3 | Docs | Anchor 点击滚动到章节 + active 跟随 | 点击目录"安装" → `location.hash` 更新 + 目标 h2 进入视口（getBoundingClientRect().top ≥ 0）；滚动页面 → 目录 active 切换 |
| 1.4 | FocusTask | 表单校验错误展示（输错提交 → Field error 可见） | 填错误值提交 → `.wf-field-error`（错误文本）可见 + 登录成功不出现；正确值 → Alert 成功 |
| 1.5 | Workspace | 文件树选中高亮 + Tabs 切换代码 | 点文件 → 中栏 CodeBlock title/内容变化（textContent 断言）；Tabs 点 ui.ts → 内容切换 |
| 1.6 | Mobile | 搜索过滤消息列表（SearchInput onInput → List 过滤） | 输入"张" → 列表只剩含"张"项（List item 数断言）；清空恢复 |

**验收总则**：每个交互 = 真实点击（`agent-browser click`）+ 状态断言（DOM 变化），不 eval click。

### Phase 2：壳体验升级（P0——开发者"参考"效率）✅ 已完成（0660f57 后续）

| # | 优化 | 状态 |
|---|------|------|
| 2.1 | **查看代码**：描述条"查看代码"按钮 → Drawer 展示模式源码（server 源码路由 + kebab→Pascal 文件名 + CodeBlock） | ✅ Drawer 589px + 源码 + 标题联动切换模式 |
| 2.2 | **模式分组**：工作台/内容展示/营销推广 3 组（wf-nav-group 标题） | ✅ 3 组 8 模式 |
| 2.3 | **键盘可达**：模式列表 ↑↓ 方向键切换（tabindex + onKeyDown） | ✅ ArrowDown → 分栏工作台 |
| 2.4 | **深链**：`#/landing` 直达 + 无效 hash 回退应用壳 | ✅ |

**框架 bug（Phase 3 待修）**：children 数组**中间位置的 null 组件**（如 closed Drawer）
导致 patchKeyedChildren 按位置 diff 错位——后续子项不更新（壳内容区模式切换
静默失效）。规避：Drawer 条件渲染（`$.showCode && <Drawer>`）+ 放 children 末尾。
根因在 allUnkeyed 分支对"渲染为 null 的组件 VNode"的 DOM 位置索引错位。

### Phase 3：框架能力补齐（P1——蓝本暴露的缺口）

| # | 缺口 | 补到 | agent-browser 验收 |
|---|------|------|-------------------|
| 3.1 | **固定宽度原语**：`wf-w-xs/sm/md/lg/xl`（320/480/640/768/1024——对齐 token 阶梯）——当前卡宽/面板宽全内联 | `src/layout/_spacing.css` | 用 wf-w-md 的卡片 → `getComputedStyle().width === '480px'` |
| 3.2 | **描述/代码展示组件**：壳"查看代码"若无法复用现有 → 评估补 `SourceView` 组件（CodeBlock + 文件名 + 复制） | `src/components/` | 源码 Drawer 渲染 CodeBlock + 复制按钮可点 |
| 3.3 | **wf-nav 折叠变体**：`wf-nav--collapsed`（图标-only 模式）——AppShell 折叠态复用原语而非手写 | `src/layout/_app-shell.css` | 折叠态 nav-item 只显图标 + 宽 64（DOM 断言） |
| 3.4 | **布局缺口扫描**：模式重写后扫描仍内联的 style（允许类除外）→ 逐项补原语 | `src/layout/` | 扫描脚本输出 0 非允许内联 |

### Phase 4：断点矩阵 + 文档（P1——系统性保障）✅ 已完成

断点矩阵（4 断点 × 8 模式）：1280/1024/768/375 全 0 横向溢出 + 窄屏降级验证
（侧栏隐藏/顶部切换条）记录到 `apps/layouts-demo/README.md`。


| # | 项 | agent-browser 验收 |
|---|----|-------------------|
| 4.1 | **断点矩阵**：8 模式 × 4 断点（1280/1024/768/375）扫描（溢出/可见性/降级）记录到本文档 | 每断点每模式 hScroll=false + 关键元素可见（矩阵表落文档） |
| 4.2 | **README 入口**：apps/layouts-demo/README.md（启动方式 + 模式清单 + 蓝本纪律引用） | 文档存在 + 启动命令可直接跑 |
| 4.3 | **回归测试**：模式渲染 smoke（SSR 或 jsdom 断言 8 模式 VNode 结构） | 单测通过 + agent-browser 抽查 2 模式 |

---

## 三、测试纪律（agent-browser 铁律）

1. **真实 HTML 优先**：断言 outerHTML / getComputedStyle / getBoundingClientRect / closest('#__wf_portal')——text 全对 ≠ 可见
2. **真实交互优先**：`agent-browser click/hover/type`——不用 eval 内 click（时序/焦点差异）
3. **双断点**：宽屏（1280）+ 窄屏（375 `agent-browser set viewport`）各跑一遍关键断言
4. **每次改动**：`npm test` 全量 + build + agent-browser 验证对应模式后提交
5. **卡住时**：`--test-timeout=3000` 二分定位（挂起 > 失败）
6. **框架缺口**：先补到 weifuwu/layout 或 weifuwu/components（含单测），再在蓝本中使用

---

## 四、执行顺序与工作量

```
Phase 1（模式交互）    6 项 × 0.5h + 验证 ≈ 1 天
Phase 2（壳体验）      4 项 ≈ 0.5 天
Phase 3（能力补齐）    4 项 ≈ 1 天（含框架单测）
Phase 4（矩阵+文档）   2 项 ≈ 0.5 天
合计 ≈ 3 天（可分批：先 Phase 1 + 2.1/2.4，再 2.2/2.3，最后 3/4）
```

**每阶段完成即 agent-browser 全链路验证 + 提交**——不留未验证的改动。
