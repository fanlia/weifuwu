# weifuwu/style 使用指南（设计语言 + wf-* 命名规范 + 三档学习路径）

> 一个 CSS 文件（`weifuwu/components/style.css`）= Token + 布局原语 + 工具类 + 组件样式。
> 本文档是**设计语言**与**学习路径**——看完第二档即可上手 90% 页面。

## 设计语言：WUI Design Language（微设计）

weifuwu 的设计语言与框架哲学同源（确定性、诚实裁剪、render-only）——**五条理念，每条都可被代码审计**：

| # | 理念 | 含义 | 代码中的体现 |
|---|------|------|-------------|
| 1 | **确定性** Deterministic | 每个可交互元素必有完整状态链：hover → focus → active → disabled | 状态层 token（`--wf-state-hover/pressed/selected`）全组件引用，audit 强制 |
| 2 | **清晰** Clear | 三层表面层级 + 三档文字层级 + 语义色只表达语义 | `--wf-surface-*` / `--wf-color-bg-elevated`；语义色 `-text` 变体 |
| 3 | **克制** Restrained | 中性色主导、品牌色点睛；动效短促有目的；阴影轻 | 动效 Token 阶梯 120-300ms；focus-ring 双层；预设 minimal |
| 4 | **专业** Instrumental | 面向 AI 应用/管理后台/数据工具：键盘可达、数据密度、三态完整 | 键盘焦点全局；compact 预设；加载/空/错误三态规范 |
| 5 | **中文原生** CJK-Native | 字阶/行高/断行针对中文；表头不做 uppercase；数字防抖 | `--wf-heading-case: none`；`wf-nums`（tabular-nums） |

主题配置三档：**① 改 `--wf-brand-seed` 一个值换肤**（色阶 color-mix 自动派生，暗色自动跟随）→ **② `<html data-preset="minimal|compact|rounded">` 预设**（与 data-theme 正交）→ **③ 深度定制**（组件钩子 + @layer 覆盖）。

## 统一命名规则：三类词根 + 三后缀（design/layout-naming.md）

类名零猜词——单属性工具直接用 **CSS 属性名**（会 CSS 即会写），
组合原语用**意图词汇**（表达要什么）。命名只有一种推导路径：

| 词根类 | 判定 | 例 |
|---|---|---|
| 概念原语 | 复合语义（≠单属性） | `wf-stack` `wf-row` `wf-grid` `wf-split` `wf-center` `wf-surface` |
| 属性根 | 单一 CSS 属性 → 属性全名 | `wf-padding-md` `wf-margin-top-sm` `wf-radius-md` `wf-justify-between` `wf-overflow-auto` |
| 裸值词 | 单值状态/行为 | `wf-bold` `wf-uppercase` `wf-truncate` `wf-dim` `wf-pill` `wf-hidden` |

**后缀语法（三种，各管一事）**：
```
wf-padding-md      -   值/子名（刻度：none|xs|sm|md|lg|xl；方向：全词 top/bottom/left/right/x/y）
wf-bubble--own     --  变体/状态（选中/激活）
wf-flex@lg         @   断点变体（≥1024px）
```

**值词汇封闭表**：标尺 `none~xl`（none = 零/取消唯一形态）·对齐用 CSS 值词
`start/center/end/stretch/between`（物理方向词禁入对齐域）·颜色语义随 token。

域前缀分域（无过载）：`wf-font-*` 字号 · `wf-text-*` 文字颜色/对齐 ·
`wf-bg-*` 背景 · `wf-medium/semibold/bold` 字重裸词 · `btn/card/modal/…` 组件域（由 props 渲染，一般不需手写）。

## 三档学习路径

### 第一档：只用组件（0 成本）

48 个组件覆盖页面功能块，完全不需要 wf-*：

```tsx
<PageHeader title="订单"><Button variant="primary">+ 新建</Button></PageHeader>
<Table data={orders} columns={cols} />
<Card hover><StatCard value="1,234" label="总用户" /></Card>
```

### 第二档：10 个核心原语（半小时，覆盖 90% 页面——消费审计实证热集）

```
wf-stack           垂直堆叠 + gap（第一原语）
wf-row             水平排列 + wrap + gap
wf-gap-sm          设置间距（配合上面）
wf-fill            flex:1 撑满（配 wf-min-width-0 防溢出）
wf-padding-md      内边距
wf-font-sm         字号（小字）
wf-text-secondary  次级文字色（第二档唯一需要记的颜色词）
wf-justify-between 两端分布
wf-border-bottom   下边框
wf-radius-md       圆角
```

```tsx
<div class="wf-justify-between">
  <div class="wf-row wf-gap-md">
    <Card>…</Card>
  </div>
  <Button variant="primary">提交</Button>
</div>
```

### 第三档：完整速查（按需查 IDE 补全）

输入 `wf-` 后按词根补全（`wf-padding-` / `wf-text-` / `wf-bg-`）。完整清单见 README「布局系统」。

## 场景速查（"我要做什么"）

| 需求 | 写法 |
|---|---|
| 两个元素两端分布 | `wf-justify-between` |
| 一列堆叠带间距 | `wf-stack wf-gap-md` |
| 一行换行居中对齐 | `wf-cluster wf-gap-md` |
| 卡片网格 | `<div class="wf-grid">` |
| 状态色文字/背景 | `wf-text-success` / `wf-bg-error` |
| 卡片 hover 抬升 | `<Card hover>` 或 `wf-elevate` |
| 聊天气泡 | `wf-bubble` / `wf-bubble--own` |
| 隐藏元素（窄隐宽显） | `wf-hidden wf-flex@lg`（响应式显隐唯一模式） |
| 角标/覆盖层 | 父 `wf-relative` + 子 `wf-absolute`（CSS 零学习配对） |
| 可滚动区 | `wf-overflow-auto`（横滚 `wf-overflow-x`） |
| 按钮变胶囊 | `:root { --wf-btn-radius: 999px }` |
| 数字防抖（统计/表格数值） | `wf-nums`（StatCard 已默认套用） |
| 顶级页面大标题 | `<PageHeader display>` |
| 状态/计数徽章 | `<Badge variant>`（不可交互，含 dot） |
| 可关闭标签 | `<Tag closable>`（可交互，有关闭钮） |
| 图标 | `<Icon name="close" />`（禁止裸 emoji/字形） |

### 排版速查（字号/行高/字距）

| 用途 | 写法 | Token |
|------|------|-------|
| 顶级页面标题 | `<PageHeader display>` | `--wf-font-size-display` (30px, 负字距) |
| 页面标题 | `wf-font-3xl/4xl` | 24/30px |
| 卡片标题 | `wf-font-xl/2xl` | 16/21px |
| 正文 | `wf-font-base`（默认） | 14px · 行高 1.5（CJK 实测可读，与主流框架同档） |
| 次级/辅助 | `wf-font-sm` / `wf-font-xs` | 13/12px · 配 `wf-text-secondary` |
| 数字/统计 | `wf-nums`（StatCard/Table 数值） | tabular-nums 防宽度抖动 |
| 标题字距/变换 | 全局 | `--wf-heading-case`（CJK 默认 none，英文可 uppercase） |

### 三态规范（加载 / 空 / 错误——专业工具感）

| 状态 | 组件组合 | 要点 |
|------|---------|------|
| 加载中 | `Skeleton`（页面/卡片级）· Button `loading` · Table 加载遮罩 | 首帧不闪：骨架屏结构与最终内容同构 |
| 无数据 | `EmptyState`（icon 可自定义 VNode） | 给下一步动作（新建/刷新按钮），不写"暂无数据"就结束 |
| 出错 | `Alert`（内联错误）· `Result`（整页错误） | 必须带重试/返回路径；表单错误用 Field `error` + 红边 |

**交互状态链**（设计语言内建，无需手写）：hover → focus-visible → active(pressed) → disabled——
菜单/列表/按钮全组件自动具备；自定义可交互元素用状态层变量：
`background: var(--wf-state-hover)`（悬停）/ `var(--wf-state-pressed)`（按压）/ `var(--wf-state-selected)`（选中）。

## 定制（零 CSS 文件）

### 品牌换色 — 改 seed 一个值，全站跟随（亮/暗色阶自动派生）

```html
<style>
  :root { --wf-brand-seed: #7c3aed; }        /* 亮色品牌（50/500/600/700 色阶自动派生） */
  :root { --wf-dark-brand-seed: #a78bfa; }   /* 暗色品牌（可选） */
</style>
```

### 预设主题 — 一个属性开箱即用

```html
<html data-preset="minimal">   <!-- 极简：中性色、弱品牌 -->
<html data-preset="compact">  <!-- 紧凑：控件/间距/字号缩一档 -->
<html data-preset="rounded">  <!-- 圆润：大圆角 + 胶囊按钮 -->
```

### 组件定制 — 设一个变量

```html
<style>
  :root {
    --wf-modal-width: 640px;
    --wf-btn-radius: 999px;
    --wf-field-height: 44px;
    --wf-card-shadow: 0 8px 24px rgba(0,0,0,.12);
  }
</style>
```

完整钩子清单：`--wf-btn-*` `--wf-card-*` `--wf-field-*` `--wf-modal-*` `--wf-drawer-width` `--wf-toast-*` `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` `--wf-switch-radius` `--wf-popover-*` `--wf-tooltip-radius` `--wf-dropdown-min-width` `--wf-datepicker-*`。

### 表面语言（微流明·边界即结构）

静态卡片 = **1px 细边框**（`--wf-color-border`）——阴影仅用于抬升语义（hover/浮层/拖拽中）；卡片 hover 抬升用 `wf-elevate`。旧阴影观感可覆盖 `--wf-card-shadow` 恢复。浮层按层级用圆角矩阵：

| 表面 | 圆角 | 底 | 说明 |
|---|---|---|---|
| Card / StatCard 默认 | --wf-radius-md (8) | bg | 细边框；阴影仅 hover（wf-elevate） |
| Modal | **--wf-radius-lg (12)** | bg-elevated | 抬升语义 |
| 面板族（dropdown/select/datepicker/popover） | --wf-field-radius | bg-elevated | 弹出面板 |
| Tooltip / 小浮层 | --wf-radius-sm (4) | bg-elevated | 摘要层 |
| Drawer | 0（贴边） | bg-elevated | 全幅侧拉 |

### 动效定制 — 时长/缓动/位移

```html
<style>
  :root {
    --wf-dur-base: 300ms;                     /* 默认动画时长 */
    --wf-ease-out: cubic-bezier(0.22, 1, 0.36, 1);  /* 入场缓动 */
    --wf-motion-lg: 32px;                     /* 抽屉全幅位移 */
  }
</style>
```

### 覆盖优先级（@layer）

```
@layer tokens, base, layout, utilities, components;   ← weifuwu 的层
未分层的用户 CSS 天然最高优先级                        ← 你写的普通规则直接生效
用户 @layer utilities 可精准盖过 weifuwu 的 utilities
```

## 主题 Token（183 个，双层）

- **原始层**（`--wf-brand-*` `--wf-slate-*` `--wf-dark-*`）：色值只定义一次，品牌/暗色调校改这里
- **语义层**（`--wf-color-*` `--wf-space-*` `--wf-radius-*` …）：组件消费，主题切换覆盖这里
- 暗色模式：`--wf-dark-*` 间接层映射，两段激活（`data-theme` / 系统偏好），无硬编码

### 动效 Token（P8 新增，全站动效统一引用）

| Token | 默认 | 用途 |
|---|---|---|
| `--wf-dur-fast/base/slow` | 120/200/300ms | 动画时长阶梯 |
| `--wf-ease-out` | `cubic-bezier(0.16,1,0.3,1)` | 入场（快出缓停） |
| `--wf-ease-in` | `cubic-bezier(0.4,0,1,1)` | 退场（渐入加速） |
| `--wf-ease-snap` | `cubic-bezier(0.34,1.56,0.64,1)` | 选中/弹跳（Segmented 等） |
| `--wf-motion-sm/md/lg` | 4/8/24px | 位移量（toast 退场/抽屉） |

### 语义文字色（P2 新增，浅底可读）

`--wf-color-{primary,success,warning,error,info}-text`（700 级，对 50 级底对比度 ≥ 4.5:1）——**文字用 `-text` 变体，500 级只做填充/边框/焦点**。实心填充上的文字用 `--wf-color-on-brand`；遮罩用 `--wf-overlay`。

### CJK / 数字（P5 新增）

- `--wf-heading-case: none`（默认）——表头/分组标题文本变换，英文项目可覆盖 `uppercase`
- `--wf-nums`——`wf-nums` 工具类的取值（tabular-nums，数字防宽度抖动）

## 图标（Icon 组件）

组件库内置 `Icon`（stroke SVG、`currentColor`、`1em` 随字号、`aria-hidden`），组件内部图标统一用它——**禁止裸文本字形**（✕✓⚠▲▼ 等）：

```tsx
h(Icon, { name: 'close' })          // 随上下文颜色/字号
h(Icon, { name: 'check', size: 16 })
```

内置 90 个：方向（chevron/arrow/sort）、状态（check/close/alert/info/warning）、操作（search/send/stop/retry/upload/trash/edit/plus）等。业务图标自备（`Icon` 只做基础集）。

**图标视觉参数**（全库统一）：24 viewBox · stroke 风格（feather-like）· `stroke-width: 1.8` ·
`linecap/linejoin: round` · `currentColor` 随文字色 · `1em` 随字号 · `aria-hidden`——
新图标必须沿用同一模板（`Icon.ts` 单一 SVG 模板对象），禁止自建参数。

## 浮层退场语义（P0/P4 变更，注意时序）

Modal/Drawer/Confirm/Toast 关闭时**先播退场动画再卸载**：

- `open=false` 后 DOM 仍存在约 200ms（播 `--exit` 动画）——时序敏感代码（测量/立即重开）需知悉
- `prefers-reduced-motion: reduce` 下动画降为 0.01ms，等效立即卸载
- Confirm 默认 `maskClosable=false`（遮罩点击不取消，防误触）；Escape 仍可关闭

## 边界（诚实说明）

- 业务具体尺寸（`width: 220px`、`min-height: 120px`）用内联——设计系统不背业务值
- 深度定制组件结构用覆盖 CSS（@layer 友好支持）
- 低频 CSS（float/filter）不做类——用内联或组件
- 动效已统一由 Token 驱动：新增动画禁止硬编码时长/缓动（audit 把关）
