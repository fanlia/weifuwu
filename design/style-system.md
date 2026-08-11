# weifuwu/style — 样式系统总览

> 一个 CSS 文件（`weifuwu/components/style.css`）= **167 个双层 Token + 基础层 + 58 个布局原语 + 136 个工具类 + 48 个组件样式 + 5 层 @layer 机制**。
> 定位：全栈框架的纯 CSS 样式层——零构建、零配置、纯 link 即得完整设计系统。

## 架构分层

```
┌─────────────────────────────────────────────┐
│ 机制层  @layer tokens < base < layout <      │ 覆盖优先级可预期
│         utilities < components；暗色双段映射   │
├─────────────────────────────────────────────┤
│ 组件层  46 个组件（btn/card/modal/table…）    │ 功能块，props 驱动
├─────────────────────────────────────────────┤
│ 工具类  122 个（间距/边框/圆角/背景/文字/气泡） │ 属性级，任意元素直接写
├─────────────────────────────────────────────┤
│ 原语层  58 个布局原语（stack/row/split…）     │ 元素间的空间关系
├─────────────────────────────────────────────┤
│ 基础层  reset / 原生控件 / focus / 触屏44px / │ 无障碍与默认品质
│         reduced-motion / color-scheme        │
├─────────────────────────────────────────────┤
│ Token   167 个 · 原始层（品牌/中性/暗色值）   │ 值只定义一次
│         语义层（组件消费，主题切换覆盖）       │
└─────────────────────────────────────────────┘
```

## 1. Token 层（167 个，双层）

**原始层（Primitive）**——色值只定义一次，品牌/暗色调校改这里：

```
--wf-brand-500/600/50      品牌主色/悬停/浅底
--wf-green-500/50          语义原始色（success）
--wf-amber-500/50          warning
--wf-red-500/50            error
--wf-sky-500/50            info
--wf-slate-900…50         中性阶（文字/背景/边框）
--wf-white
--wf-dark-*               暗色值（暗色模式经间接层引用，零硬编码）
```

**语义层（Semantic）**——组件消费，暗色/主题切换覆盖这里：

```
--wf-color-primary / -hover / -bg     品牌
--wf-color-success / warning / error / info（+ -bg 浅底）
--wf-color-text / -secondary / -tertiary / -disabled
--wf-color-bg / -bg-secondary / -bg-tertiary
--wf-color-border / -light / -dark
--wf-space-*  --wf-gap-*  --wf-radius-*  --wf-shadow-*
--wf-font-*  --wf-line-height-*  --wf-letter-spacing-*
--wf-z-*  --wf-bp-*  --wf-control-*  --wf-sidebar-width
```

**定制**：品牌换色 = 覆盖 `--wf-brand-500` 一个值全站跟随（实测）。

## 2. 基础层

- 全局 reset（box-sizing）、body 排版、链接/标题/段落/表格/代码默认样式
- 原生控件（input/textarea/select/button）统一外观 + accent-color
- `button:focus-visible` / `[tabindex]:focus-visible` 键盘焦点环
- 触屏（coarse pointer）交互目标提升到 44px（WCAG 2.5.8）
- `prefers-reduced-motion` 全局降级
- `color-scheme` 随主题切换（原生控件/滚动条跟随）

## 3. 布局原语层（67 个）

| 类别 | 原语 |
|---|---|
| 排列 | `wf-layout-stack` `wf-layout-row` `wf-layout-split` `wf-layout-center` `wf-layout-cluster` `wf-layout-nowrap` |
| 弹性 | `wf-layout-fill` `wf-layout-fixed` `wf-layout-auto` `wf-layout-shrink` |
| Z轴/定位 | `wf-layout-cover` `wf-layout-pop` `wf-layout-anchor` `wf-layout-layer` `wf-layout-sticky` |
| 容器 | `wf-layout-grid` `wf-layout-container` `wf-layout-surface` `wf-layout-scroll` `wf-layout-clip` `wf-layout-contents` |
| 显隐 | `wf-layout-hidden/block/inline/inline-block`（含 `@sm/md/lg` 断点变体） |
| 外壳 | `wf-layout-app-shell` `wf-layout-sidebar(-header/body/footer)` `wf-layout-nav(-group/item/icon)` `wf-layout-main` |

断点变体 `@sm/@md/@lg`（≥640/768/1024px）覆盖 stack/row/hidden/block。

## 4. 工具类层（122 个）

| 域 | 类 | 说明 |
|---|---|---|
| 间距 | `wf-p/py/py-*` `wf-mt/mb/my-*`（xs~2xl+0）`wf-mx-auto` | 消费 `--wf-space-*` |
| gap | `wf-gap-none` `wf-gap-xs…2xl` | 为 flex/grid 设 `--wf-gap` |
| 尺寸 | `wf-w-full/h-full/w-auto` | |
| 边框 | `wf-border` `wf-border-t/b/l/r` | |
| 圆角 | `wf-rounded-sm/base/md/lg` `wf-pill` | |
| 背景 | `wf-bg-secondary/tertiary/primary/success/warning/error/info` | 语义浅底 |
| 文字色 | `wf-text-secondary/tertiary/disabled/primary/success/warning/error/info` | |
| 字号 | `wf-text-xs…5xl`（9 档） | |
| 字重/行高/字距 | `wf-text-medium/semibold/bold` `wf-leading-tight/base/relaxed` `wf-tracking-*` | |
| 对齐/变换 | `wf-text-left/center/right` `wf-uppercase/lowercase/capitalize` | |
| 换行/截断 | `wf-pre-wrap` `wf-break-word` `wf-text-nowrap` `wf-truncate` `wf-line-clamp-2/3` | |
| 气泡 | `wf-bubble` `wf-bubble--own` `wf-bubble--ai` | 聊天消息 |
| 内容排版 | `wf-prose` | 富文本正文（h2/p/ul/blockquote/pre…） |
| 视觉态 | `wf-dim` `wf-pointer` `wf-not-allowed` `wf-print-hidden/block` | |

## 5. 组件样式层（46 个组件）

Button/Input/Textarea/Select/Checkbox/Switch/RadioGroup/Table/Modal/Confirm/Toast/Alert/Loading/EmptyState/Tabs/Dropdown/Pagination/Card/Badge/Avatar/Tag/StatCard/Steps/Form/Field/Slider/SearchInput/**SegmentedControl**/ProgressBar/Accordion/PageHeader/Breadcrumb/Divider/FileUpload/Tooltip/Drawer/Popover/Skeleton/Img/InView/DatePicker/Chart/Editor/ThemeSwitch/**ToolCallCard**/**ApprovalCard**

- 全部消费 `--wf-*` token，暗色自动适配
- 6 色语义体系贯穿变体（`--primary/success/warning/error/info`）
- 无障碍基线内建：focus-visible、aria、键盘可达

## 6. 机制层

**@layer 层叠**：`@layer tokens, base, layout, utilities, components;`——未分层的用户 CSS 天然最高优先级；`@layer utilities` 可精准覆盖（实测）。

**暗色双段激活**：`data-theme="dark"`（手动）+ `prefers-color-scheme`（系统），值经 `--wf-dark-*` 间接层映射（零硬编码，审计强制）。

**组件定制钩子**（29 个变量，默认值 = 现有 token）：
`--wf-btn-radius/pad-*` `--wf-card-radius/shadow` `--wf-field-radius/height` `--wf-modal-width/radius/shadow` `--wf-drawer-width` `--wf-toast-width/radius` `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` `--wf-switch-radius` `--wf-popover-width/radius` `--wf-tooltip-radius` `--wf-dropdown-min-width` `--wf-datepicker-*`。

## 7. 命名体系

```
统一语法：wf-<域>-<名字>
布局原语   wf-layout-stack
工具类     wf-p-md / wf-text-primary / wf-border-b
组件类     wf-btn--primary（-- = 变体/状态）
断点变体   wf-layout-stack@md（@ = ≥768px）
值类       wf-uppercase / wf-truncate / wf-pre-wrap（无属性域的单值）
```

## 8. 接入方式（三种，零构建）

```ts
// ① 全栈 weifuwu（推荐）
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

// ② 纯 HTML / 非 weifuwu 项目
<link rel="stylesheet" href="/node_modules/weifuwu/layout">

// ③ CDN
<link rel="stylesheet" href="https://unpkg.com/weifuwu@latest/dist/components/style.css">
```

## 9. 质量基线

- **测试**：796 全绿 + style-audit 8 项（token 计数同步、z-index/font-size 无硬编码、组件关键视觉 var() 化、暗色零硬编码、focus 规则、reduced-motion、暗色双段）
- **应用证据**：agent-platform（409 行自研 CSS 删除）、components-demo 全部零 style.css，浏览器实测 0 非 `wf-*` 类（早期验证应用 aippt/weifuwu-demo 已归档）

## 10. 文档地图

| 文档 | 内容 |
|---|---|
| `docs/style-guide.md` | 使用指南：命名规范 + 三档学习路径 + 场景速查 + 变量定制 |
| `README.md`「布局系统」「样式定制指南」 | 原语/Token 全表 + 定制钩子 + @layer |
| `docs/token-layout-optimize.md` | P7 演进计划与验收记录 |
| `docs/design-system-gaps.md` | P5-P6 缺口走查与应用转换记录 |

## 诚实边界

- 业务具体尺寸（`width: 220px`）用内联——设计系统不背业务值
- 深度定制组件结构用覆盖 CSS（@layer 友好）
- 低频 CSS（float/filter/动画）不做类——内联或组件
