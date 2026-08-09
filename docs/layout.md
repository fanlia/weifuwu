# 布局系统（weifuwu/layout）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

纯 CSS 布局原语 + 工具类 + 141 个主题 Token。不绑定任何 JS 框架。

> **学习路径与命名规范**：见 [`design/style-guide.md`](../design/style-guide.md)——统一语法 `wf-<域>-<名>`、三档学习（组件 → 10 核心原语 → 完整速查）、场景速查、变量定制。

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

## 70 个布局原语

| 类别 | 原语 | 效果 |
|------|------|------|
| **排列** | `wf-stack` `wf-stack@sm/md/lg` | 纵向 flex + gap（断点变体→横向） |
| | `wf-stack-reverse` `@sm/md/lg` | 纵向反向 |
| | `wf-row` `wf-row@sm/md/lg` | 横向 flex + wrap + gap |
| | `wf-row-reverse` `@sm/md/lg` | 横向反向 |
| | `wf-nowrap` | flex-wrap: nowrap |
| | `wf-cluster` | 换行居中簇 |
| **分布** | `wf-split` | justify-content: space-between |
| | `wf-center` | 双轴居中 |
| | `wf-right` | justify-content: flex-end |
| | `wf-around` | space-around |
| | `wf-evenly` | space-evenly |
| **对齐** | `wf-top` | align-items: flex-start |
| | `wf-bottom` | align-items: flex-end |
| | `wf-stretch` | align-items: stretch |
| **弹性** | `wf-fill` | flex: 1 + min-width: 0 |
| | `wf-fixed` | flex: none |
| | `wf-auto` | flex: auto |
| | `wf-shrink` | min-width/height: 0 |
| **Z轴** | `wf-cover` | position: fixed + inset: 0 |
| | `wf-pop` | position: absolute |
| | `wf-anchor` | position: relative |
| | `wf-layer` | position: relative + z-index |
| | `wf-sticky` | position: sticky |
| | `wf-popup` | 浮层基类：宽度视口 clamp（`min(var(--wf-popup-max, 480px), calc(100vw - 32px))`） |
| **安全区** | `wf-safe-bottom` / `wf-safe-top` | iOS 刘海屏/Home 条：`padding: env(safe-area-inset-*)` |
| **容器** | `wf-surface` | 基础面（border-radius + shadow + bg） |
| | `wf-grid` | display: grid + --wf-cols |
| | `wf-container` | max-width + margin: auto |
| | `wf-scroll` | overflow: auto |
| | `wf-clip` | overflow: hidden |
| **显隐** | `wf-hidden` `wf-hidden@sm/md/lg` | display: none |
| | `wf-block` `wf-block@sm/md/lg` | display: block |
| | `wf-inline` | display: inline |
| | `wf-inline-block` | display: inline-block |
| | `wf-contents` | display: contents |
| **间距** | `wf-p-*` / `wf-px-*` / `wf-py-*`（xs~2xl） | padding：全/水平/垂直，引用 `--wf-space-*` |
| | `wf-mt-*` / `wf-mb-*` / `wf-my-*`（xs~2xl） | margin：top/bottom/垂直 |
| | `wf-mx-auto` / `wf-my-auto` | margin: auto 居中 |
| | `wf-gap-*`（xs~2xl） | 为 flex/grid 原语设置 `--wf-gap` |
| **尺寸** | `wf-w-full` / `wf-h-full` / `wf-w-auto` | 宽/高 100%、auto |
| **边框** | `wf-border` / `wf-border-t/b/l/r` | 1px 边框（`--wf-border-width` + `--wf-color-border`） |
| **面工具** | `wf-bg-secondary/tertiary/brand/success/warning/error/info` | 语义背景色（`--wf-color-*-bg`） |
| | `wf-pill` | 胶囊圆角（999px，状态徽章/标签/色块） |
| | `wf-rounded-sm` `wf-rounded` `wf-rounded-md` `wf-rounded-lg` | 圆角工具（`--wf-radius-*`） |
| **气泡** | `wf-bubble` / `wf-bubble--own` / `wf-bubble--ai` | 聊天气泡（pre-wrap + 折行内建） |
| **打印** | `wf-print-hidden` / `wf-print-block` | 导出 PDF 时隐藏工具区 / 恢复块级 |
| **行高** | `wf-leading-tight` `wf-leading-base` `wf-leading-relaxed` | line-height（`--wf-line-height-*`） |
| **指针** | `wf-pointer` / `wf-not-allowed` | cursor: pointer / not-allowed |
| **内容排版** | `wf-prose` | 富文本正文（文章/博客/文档，一个类包 h2/p/ul/blockquote/pre…） |
| **外壳** | `wf-app-shell` | 应用外壳：侧边栏 + 主区 grid（`--wf-sidebar-width`） |
| | `wf-sidebar` `wf-sidebar-header` `wf-sidebar-body` `wf-sidebar-footer` | 侧边栏：品牌区/导航区/底部用户区，sticky 全高 |
| | `wf-nav` `wf-nav-group` `wf-nav-item` `wf-nav-icon` | 导航：分组标题 + 链接项（`--active` 激活态） |
| | `wf-main` | 主内容区（padding + min-width: 0） |
| | `wf-text-*` 排版工具 | 见下文「排版工具」 |

### 排版工具（`wf-text-*`）

| 工具 | 效果 |
|------|------|
| `wf-text-left/center/right` | text-align |
| `wf-text-xs…5xl` | 字号（`--wf-font-size-*`） |
| `wf-text-secondary/tertiary/disabled/brand` | 中性色阶 |
| `wf-text-success/warning/error/info` | 语义色文本（`--wf-color-*`） |
| `wf-text-medium/semibold/bold` | 字重 |
| `wf-tracking-normal/wide/wider` | letter-spacing |
| `wf-uppercase/lowercase/capitalize` | text-transform |
| `wf-pre-wrap` | white-space: pre-wrap + word-break（聊天气泡/代码） |
| `wf-break-word` | overflow-wrap + word-break |
| `wf-text-nowrap` | white-space: nowrap |
| `wf-truncate` | 单行省略（ellipsis） |
| `wf-line-clamp-2/3` | 多行截断 |

## 141 个主题 Token

**双层结构**：原始层（Primitive，色值只定义一次，品牌/暗色调校改这里）+ 语义层（Semantic，组件消费）。

```css
/* ── 原始层 — 品牌/中性色值 + 暗色值，主题定制改这一层 ── */
--wf-brand-500 / --wf-brand-600 / --wf-brand-50   /* 品牌主色/悬停/浅底 */
--wf-slate-900…50 / --wf-white                     /* 中性阶 */
--wf-dark-*                                        /* 暗色值（暗色模式经间接层引用，零硬编码） */

/* ── 语义层 — 组件消费，暗色/主题切换覆盖这里 ── */
/* 品牌色 */
--wf-color-primary / --wf-color-primary-hover / --wf-color-primary-bg

/* 语义色 */
--wf-color-success / --wf-color-success-bg
--wf-color-warning / --wf-color-warning-bg
--wf-color-error / --wf-color-error-bg
--wf-color-info / --wf-color-info-bg

/* 语义文字色（P2）：浅底可读 700 级，文字用 -text、填充用 500 级 */
--wf-color-primary-text / --wf-color-success-text / --wf-color-warning-text / --wf-color-error-text / --wf-color-info-text
--wf-color-on-brand   /* 实心品牌/语义底上的文字与图标 */
--wf-overlay          /* 浮层遮罩（Modal/Drawer），暗色自动加深 */

/* 文字色 */
--wf-color-text / --wf-color-text-secondary / --wf-color-text-tertiary / --wf-color-text-disabled

/* 背景色 */
--wf-color-bg / --wf-color-bg-secondary / --wf-color-bg-tertiary

/* 边框色 */
--wf-color-border / --wf-color-border-light / --wf-color-border-dark

/* 字体 */
--wf-font-sans / --wf-font-mono

/* 字号: xs sm base lg xl 2xl 3xl 4xl 5xl display */
--wf-font-size-*

/* 字重: normal medium semibold bold */
--wf-font-weight-*

/* 行高: tight normal relaxed */
--wf-line-height-*

/* 字距: normal wide wider */
--wf-letter-spacing-*

/* 间距: xs sm md lg xl 2xl */
--wf-space-*

/* 间隔: xs sm md lg xl 2xl */
--wf-gap-*

/* 圆角: sm md lg xl */
--wf-radius-*

/* 阴影: sm md lg */
--wf-shadow-*

/* 动效（P0）：时长阶梯/缓动曲线/位移量，全站动效统一引用 */
--wf-dur-fast / --wf-dur-base / --wf-dur-slow
--wf-ease-out / --wf-ease-in / --wf-ease-snap
--wf-motion-sm / --wf-motion-md / --wf-motion-lg

/* 表头/分组标题（P5）：CJK 感知，默认 none/0，英文可覆盖 */
--wf-heading-case / --wf-heading-tracking

/* 数字（P5）：tabular-nums 防宽度抖动（wf-nums 工具类） */
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

