# 布局原语使用指南

> 本页为叙述性指南——组件/能力逐项参考见 content/ 各域目录。
> 命名规则完整版：`docs/style-guide.md` 与 `design/layout-naming.md`。

# 布局系统（weifuwu/layout）

纯 CSS 50 个布局原语 + 92 个工具类 + 183 个主题 Token。不绑定任何 JS 框架。
**类面随消费证据生长**（契约测试锁定——零消费类不供养，缺口审计机制化）。

> **命名零猜词**：单属性工具直接用 CSS 属性名（`wf-padding-md` / `wf-justify-between`），
> 组合原语用意图词汇（`wf-stack` / `wf-surface`）。三后缀语法：
> `-` 值/子名 · `--` 变体 · `@` 断点。

> **全栈 weifuwu 项目**：`weifuwu/components/style.css` 已包含布局系统，一条 import 就够了，无需单独引用本页。
> 本页仅适用于**非 weifuwu 项目**或**只需 CSS 布局**的场景。

```html
<link rel="stylesheet" href="/node_modules/weifuwu/layout">
```

或在 weifuwu 服务端通过 `ctx.ui.css` 直接引用包名（`ctx.ui.css` 自动解析 exports map）：

```ts
// 方案 A：组件 + 布局全部搞定（推荐）
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

// 方案 B：只用布局
app.get('/layout.css', (req, ctx) => ctx.ui.css('weifuwu/layout'))
```

也支持相对路径：`ctx.ui.css('./src/style.css')`。

## 原语与工具类清单

| 类别 | 类 | 效果 |
|------|------|------|
| **排列** | `wf-stack` | 纵向 flex + gap（页面/卡片骨架首选） |
| | `wf-row` / `wf-row-reverse` | 横向 flex + wrap + gap |
| | `wf-nowrap` | flex-wrap: nowrap |
| | `wf-cluster` | 换行居中簇（标签/按钮组） |
| **分布对齐** | `wf-justify-between` | justify-content: space-between |
| | `wf-justify-end` | justify-content: flex-end |
| | `wf-center` | 双轴居中（column 容器） |
| | `wf-items-start/center/end/stretch` | 交叉轴对齐（设 `--wf-align`——wf-row/stack 消费） |
| | `wf-self-start/center/end/stretch` | align-self（弹性/网格子项单独对齐） |
| **弹性** | `wf-fill` | flex: 1 + min-width/height: 0 |
| | `wf-shrink` | min-width/height: 0 |
| | `wf-min-width-0` | min-width: 0（单边收缩） |
| **定位** | `wf-relative` | position: relative（角标配对父级） |
| | `wf-absolute` | position: absolute（容器内角标：父 `wf-relative`/`wf-layer`） |
| | `wf-sticky` | position: sticky（`--wf-offset` 控制吸顶位置） |
| | `wf-cover` | position: fixed + inset: 0 + 双轴居中（全屏覆盖） |
| | `wf-layer` | position: relative + z-index（层叠容器） |
| **溢出** | `wf-overflow-auto` | overflow: auto（可滚动区） |
| | `wf-overflow-hidden` | overflow: hidden（裁剪） |
| | `wf-overflow-x` | overflow-x: auto（横向滚动条） |
| **安全区** | `wf-safe-top` / `wf-safe-bottom` | iOS 刘海屏/Home 条：`padding: env(safe-area-inset-*)` |
| **容器** | `wf-grid` | display: grid + `--wf-cols` 控制列 |
| | `wf-container` | 水平居中定宽（`--wf-max` 控制宽度） |
| | `wf-split` | 两端展开（左弹性右固定） |
| **显隐** | `wf-hidden` `wf-hidden@lg` | display: none |
| | `wf-flex` `wf-flex@sm` `wf-flex@lg` | display: flex（响应式显隐的 flex 容器恢复用——见「组合规则」） |
| | `wf-block` | display: block |
| | `wf-dim` | opacity 0.7（运行中/历史态淡化） |
| **间距** | `wf-padding-*`（xs~xl）/ `wf-padding-{x,y,top,bottom,left}-*` | padding，引用 `--wf-space-*` |
| | `wf-margin-none` | margin: 0（零值唯一形态 `none`） |
| | `wf-margin-top-*` / `wf-margin-bottom-*` / `wf-margin-left-*`（含 `top-none`） | margin 方向类 |
| | `wf-margin-x-auto` | margin: auto 水平居中 |
| | `wf-gap-*`（none~xl） | 直接设 gap 属性（flex/grid 间距） |
| **尺寸** | `wf-width-full` / `wf-height-full` / `wf-width-sm` | 宽/高 100% / 定宽 480px |
| **边框** | `wf-border` / `wf-border-top/bottom/left/right` / `wf-border-none` | 1px 边框（`--wf-border-width` + `--wf-color-border`） |
| **面工具** | `wf-surface` / `wf-surface--flat` | 基础面（圆角 + 阴影 + 底）；flat = 平面表面 |
| | `wf-bg-secondary/tertiary/primary/warning/error` / `wf-bg-none` | 语义背景色（`--wf-color-*-bg`） |
| | `wf-elevate` | hover 抬升（阴影 + 上移 + 焦点环） |
| | `wf-panel-in` | 面板入场动画（scale + fade） |
| | `wf-pill` | 胶囊圆角（999px，状态徽章/标签/色块） |
| | `wf-radius-sm` `wf-radius` `wf-radius-md` `wf-radius-lg` | 圆角工具（随 `--wf-radius-*`） |
| | `wf-shadow` | 阴影（随 `--wf-shadow`） |
| **气泡** | `wf-bubble` / `wf-bubble--own` / `wf-bubble--ai` | 聊天气泡（pre-wrap + 折行内建） |
| **指针** | `wf-pointer` | cursor: pointer |
| **内容排版** | `wf-prose` | 富文本正文（文章/博客/文档，一个类包 h2/p/ul/blockquote/pre…） |
| **外壳** | `wf-app-shell` | 应用外壳：侧边栏 + 主区 grid（`--wf-sidebar-width`） |
| | `wf-sidebar` `wf-sidebar-header` `wf-sidebar-body` `wf-sidebar-footer` | 侧边栏：品牌区/导航区/底部用户区，sticky 全高 |
| | `wf-nav` `wf-nav-group` `wf-nav-item` `wf-nav-icon` | 导航：分组标题 + 链接项（`--active` 激活态）；折叠态 `wf-nav--collapsed`（图标-only——**导航项需加 `title` 属性**提供悬停提示，CSS 无法自动补） |
| | `wf-main` | 主内容区（padding + min-width: 0；长文本设 `--wf-main-max: 900px` 限宽居中——文档站场景） |

### 组合规则（冲突防线）

原语分两类：**布局身份类**（display/position/flex-direction——stack/row/grid/nav/center/cover…）
与**叠加工具类**（gap/对齐/显隐——叠加在身份类上）。规则：

1. **同一元素只带一个布局身份类**——两个身份类设置同一属性不同值时 import 顺序定胜负，
   静默失效（事故例：`wf-nav wf-row` → nav 的 column 胜，横向失效；`wf-grid wf-stack` → stack 胜，网格失效）。
   冲突矩阵由 `node scripts/layout-inventory.mjs --json` 生成（属性指纹自动推导）。
2. **对齐工具可叠加**：`wf-items-*` 覆盖 `wf-row`/`wf-stack` 的默认对齐（变量机制，无顺序问题）；
   `wf-justify-*` 是独立身份类（自带 display:flex）；`wf-nowrap` 专门关 `wf-row` 的 wrap。
3. **`wf-center` 是 column 双轴居中**（不是 justify-center）——要"行内水平居中"用 `wf-cluster`，
   不要 `wf-row wf-center`（center 的 column 方向会静默覆盖 row）。
4. **响应式显隐唯一模式 `wf-hidden + wf-flex@lg`** = 窄隐宽显（flex 容器）。
   不可用 `wf-block` 恢复——block 会覆盖 `wf-stack` 的 display:flex，gap 静默失效。
5. **容器内角标配对**：父 `wf-relative`（或 `wf-layer`）+ 子 `wf-absolute`——CSS 零学习配对；
   视口级固定覆盖用 `wf-cover`。

### 排版工具

| 工具 | 效果 |
|------|------|
| `wf-font-xs/sm/base/lg/2xl/3xl/4xl/display` | 字号（随 `--wf-font-size-*`） |
| `wf-medium` / `wf-semibold` / `wf-bold` | 字重（裸值词） |
| `wf-text-secondary/tertiary/primary/success/warning/error` | 文字色（语义——浅底可读 700 级） |
| `wf-text-on-brand` / `wf-text-on-warning` | 实心填充上的文字色（对比度保障） |
| `wf-text-left/center/right` | text-align |
| `wf-tracking-wide/wider` | letter-spacing（排版术语） |
| `wf-nums` | tabular-nums（数值防宽度抖动） |
| `wf-uppercase` | text-transform |
| `wf-pre-wrap` | white-space: pre-wrap + word-break（聊天气泡/代码） |
| `wf-break-word` | overflow-wrap + word-break |
| `wf-text-nowrap` | white-space: nowrap |
| `wf-truncate` | 单行省略（ellipsis） |

## 183 个主题 Token

**双层结构**：原始层（Primitive，色值只定义一次，品牌/暗色调校改这里）+ 语义层（Semantic，组件消费）。

```css
/* ── 原始层 — 品牌/中性色值 + 暗色值，主题定制改这一层 ── */
--wf-brand-seed / --wf-dark-brand-seed   /* 品牌 seed：改一个值全站换肤，50/500/600/700 色阶 color-mix 派生 */
--wf-brand-500 / --wf-brand-600 / --wf-brand-50   /* 品牌色阶（seed 派生，可单独覆盖） */
--wf-slate-900…50 / --wf-white                     /* 中性阶 */
--wf-dark-*                                        /* 暗色值（暗色模式经间接层引用，零硬编码） */

/* ── 语义层 — 组件消费，暗色/主题切换覆盖这里 ── */
/* 状态层 */
--wf-state-hover / --wf-state-pressed / --wf-state-selected   /* 交互状态反馈（暗色自动映射） */
--wf-color-bg-elevated                                        /* 浮层面板底色（暗色抬升一级） */
/* 品牌色 */
--wf-color-primary / --wf-color-primary-hover / --wf-color-primary-bg

/* 语义色 */
--wf-color-success / --wf-color-success-bg
--wf-color-warning / --wf-color-warning-bg
--wf-color-error / --wf-color-error-bg
--wf-color-info / --wf-color-info-bg

/* 语义文字色：浅底可读 700 级，文字用 -text、填充用 500 级 */
--wf-color-primary-text / --wf-color-success-text / --wf-color-warning-text / --wf-color-error-text / --wf-color-info-text
--wf-color-on-brand / --wf-color-on-warning   /* 实心填充上的文字与图标 */
--wf-overlay          /* 浮层遮罩（Modal/Drawer），暗色自动加深 */

/* 文字色 */
--wf-color-text / --wf-color-text-secondary / --wf-color-text-tertiary / --wf-color-text-disabled

/* 背景色 */
--wf-color-bg / --wf-color-bg-secondary / --wf-color-bg-tertiary

/* 边框色 */
--wf-color-border / --wf-color-border-light / --wf-color-border-dark

/* 字体（--wf-font-sans 已含 CJK 回退：PingFang SC / Hiragino / 雅黑 / Noto Sans SC——
   中文原生：西文最优字形 + 中文三平台一致；--wf-font-mono 同） */
--wf-font-sans / --wf-font-mono

/* 字号: xs sm base lg xl 2xl 3xl 4xl 5xl display */
--wf-font-size-*

/* 字重: normal medium semibold bold */
--wf-font-weight-*

/* 行高: tight normal relaxed */
--wf-line-height-*

/* 字距: normal wide wider */
--wf-letter-spacing-*

/* 间距: xs sm md lg xl 2xl（padding/margin 类消费） */
--wf-space-*

/* 间隔: xs sm md lg xl 2xl（gap 类消费） */
--wf-gap-*

/* 圆角: sm md lg xl */
--wf-radius-*

/* 阴影: sm md lg */
--wf-shadow-*

/* 动效：时长阶梯/缓动曲线/位移量，全站动效统一引用 */
--wf-dur-fast / --wf-dur-base / --wf-dur-slow
--wf-ease-out / --wf-ease-in / --wf-ease-snap
--wf-motion-sm / --wf-motion-md / --wf-motion-lg

/* 表头/分组标题：CJK 感知，默认 none/0，英文可覆盖 */
--wf-heading-case / --wf-heading-tracking

/* 数字：tabular-nums 防宽度抖动（wf-nums 工具类） */
--wf-nums

/* 其他 */
--wf-border-width / --wf-focus-ring
--wf-transition-duration / --wf-transition-timing
--wf-accent-color / --wf-caret-color
--wf-opacity-disabled / --wf-opacity-overlay
--wf-pop-z / --wf-cover-z

/* 应用外壳 */
--wf-sidebar-width
```

### 暗色模式

两种激活方式（显式 `data-theme` 优先级更高）：

```ts
// 1. 手动切换
// document.documentElement.setAttribute('data-theme', 'dark')
// document.documentElement.setAttribute('data-theme', 'light') // 强制亮色

// 2. 自动：系统暗色偏好（无需任何代码）
// 系统为暗色时自动生效；加 data-theme="light" 可强制亮色
```

暗色值定义在原始层 `--wf-dark-*`（只写一次），`_dark.css` 两段仅做语义映射——改暗色调校只动原始层，无硬编码色值。

---
