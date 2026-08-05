# weifuwu/style 使用指南（wf-* 命名规范 + 三档学习路径）

> 一个 CSS 文件（`weifuwu/components/style.css`）= Token + 布局原语 + 工具类 + 组件样式。
> 本文档是**学习路径**与**命名规范**——看完第二档即可上手 90% 页面。

## 统一语法：`wf-<域>-<名字>`

所有类遵循一个规则：`wf-` + **域** + 名字。

| 域 | 例子 | 说明 |
|---|---|---|
| `layout`（布局原语） | `wf-layout-stack` `wf-layout-split` `wf-layout-grid` | 元素之间的空间关系 |
| `p/m/gap/w/h`（间距尺寸） | `wf-p-md` `wf-mt-lg` `wf-gap-sm` `wf-w-full` | padding/margin/gap/width/height |
| `border/rounded`（边框圆角） | `wf-border-b` `wf-rounded-md` `wf-pill` | |
| `bg/text/weight/leading/align/tracking`（视觉） | `wf-bg-primary` `wf-text-secondary` `wf-weight-semibold` `wf-leading-base` | |
| `btn/card/modal/…`（组件域） | `wf-btn--primary` `wf-card--hover` | 组件由 props 渲染，一般不需手写 |

**修饰符号**：
```
wf-card--active    -- = 变体/状态（选中/激活/hover）
wf-modal-header    -  = 子元素（组件内部结构，不手写）
wf-layout-stack@md @  = 断点变体（≥768px 时横向）
```

**值类（裸词）**：单值工具没有属性域——`wf-uppercase` `wf-truncate` `wf-pre-wrap` `wf-dim` `wf-pill`。

## 三档学习路径

### 第一档：只用组件（0 成本）

44 个组件覆盖页面功能块，完全不需要 wf-*：

```tsx
<PageHeader title="订单"><Button variant="primary">+ 新建</Button></PageHeader>
<Table data={orders} columns={cols} />
<Card hover><StatCard value="1,234" label="总用户" /></Card>
```

### 第二档：10 个核心原语（半小时，覆盖 90% 页面）

```
wf-layout-stack   垂直堆叠 + gap
wf-layout-row     水平排列 + wrap
wf-layout-split   两端分布
wf-layout-fill    flex: 1 撑满
wf-gap-md         设置间距（配合上面）
wf-p-md           内边距
wf-text-secondary 次级文字
wf-bg-primary     品牌浅底
wf-border-b       下边框
wf-rounded-md     圆角
```

```tsx
<div class="wf-layout-split">
  <div class="wf-layout-row wf-gap-md">
    <Card>…</Card>
  </div>
  <Button variant="primary">提交</Button>
</div>
```

### 第三档：完整速查（按需查 IDE 补全）

输入 `wf-layout-` / `wf-text-` / `wf-bg-` 弹出全部候选。完整清单见 README「布局系统」。

## 场景速查（"我要做什么"）

| 需求 | 写法 |
|---|---|
| 两个元素两端分布 | `wf-layout-split` |
| 一列堆叠带间距 | `wf-layout-stack wf-gap-md` |
| 一行换行居中对齐 | `wf-layout-row wf-gap-md wf-layout-cluster` |
| 卡片网格 | `<div class="wf-layout-grid">` |
| 状态色文字/背景 | `wf-text-success` / `wf-bg-error` |
| 卡片 hover 抬升 | `<Card hover>` |
| 聊天气泡 | `wf-bubble` / `wf-bubble--own` |
| 文章正文排版 | `<article class="wf-prose">` |
| 隐藏元素（桌面显示/移动隐藏） | `wf-layout-hidden@sm` |
| 按钮变胶囊 | `:root { --wf-btn-radius: 999px }` |

## 定制（零 CSS 文件）

### 品牌换色 — 改原始层一个值，全站跟随

```html
<style>
  :root { --wf-brand-500: #7c3aed; }        /* 亮色品牌 */
  :root { --wf-dark-brand-500: #a78bfa; }   /* 暗色品牌（可选） */
</style>
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

### 覆盖优先级（@layer）

```
@layer tokens, base, layout, utilities, components;   ← weifuwu 的层
未分层的用户 CSS 天然最高优先级                        ← 你写的普通规则直接生效
用户 @layer utilities 可精准盖过 weifuwu 的 utilities
```

## 主题 Token（115 个，双层）

- **原始层**（`--wf-brand-*` `--wf-slate-*` `--wf-dark-*`）：色值只定义一次，品牌/暗色调校改这里
- **语义层**（`--wf-color-*` `--wf-space-*` `--wf-radius-*` …）：组件消费，主题切换覆盖这里
- 暗色模式：`--wf-dark-*` 间接层映射，两段激活（`data-theme` / 系统偏好），无硬编码

## 边界（诚实说明）

- 业务具体尺寸（`width: 220px`、`min-height: 120px`）用内联——设计系统不背业务值
- 深度定制组件结构用覆盖 CSS（@layer 友好支持）
- 低频 CSS（float/filter/动画）不做类——用内联或组件
