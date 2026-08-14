# 主题配置指南（三档）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)
> 主题配置按复杂度分三档——**90% 的项目止步于第一档**。

## 第一档：1 个值换肤（90% 项目）

改 `--wf-brand-seed` **一个值**，亮/暗全站色板自动跟随（50/500/600/700 色阶经
`color-mix()` 派生；不支持 color-mix 的旧浏览器自动回退默认色板——渐进增强，零 JS）：

```html
<style>
  :root {
    --wf-brand-seed: #7c3aed;      /* 品牌主色（亮色）——一个值全站跟随 */
    --wf-dark-brand-seed: #a78bfa; /* 暗色品牌（可选，不设则暗色沿用亮色色板） */
  }
</style>
```

品牌换色 = 改 `--wf-brand-seed`；组件定制 = 设一个钩子变量：

```html
<style>
  :root {
    --wf-modal-width: 640px;      /* 组件定制钩子 */
    --wf-btn-radius: 999px;
    --wf-field-height: 44px;
    --wf-card-shadow: 0 8px 24px rgba(0,0,0,.12);
  }
</style>
```

钩子清单：`--wf-btn-*` `--wf-card-*` `--wf-field-*` `--wf-modal-*` `--wf-drawer-width` `--wf-toast-*` `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` `--wf-switch-radius` `--wf-popover-*` `--wf-tooltip-radius` `--wf-dropdown-min-width` `--wf-datepicker-*`。

## 第二档：预设主题（开箱即用）

`<html data-preset="minimal|compact|rounded">` 一键切换预设（与暗色 `data-theme` 正交，可组合）：

| 预设 | 语义 | 适用 |
|------|------|------|
| `minimal` | 品牌弱化：中性蓝灰主色 | 内容/文档型产品（Geist 式克制） |
| `compact` | 紧凑密度：控件/间距/字号缩一档 | 数据密集型工具（管理后台/监控） |
| `rounded` | 大圆角：radius 全升一档 + 按钮胶囊 | 亲和/消费型产品 |

```html
<html data-theme="dark" data-preset="compact">
<!-- 暗色 + 紧凑密度可同时生效 -->
```

React/JS 侧：`<ThemeSwitch preset onPresetChange={...} />` 渲染模式 + 预设双行切换
（localStorage 持久化，`wf_theme_preset` key）。

## 第三档：深度定制

**组件级覆盖**（@layer 友好，未分层用户 CSS 天然最高优先级）：

```css
/* 覆盖 Button 主色 */
.wf-btn--primary {
  background: #06b6d4;
  border-color: #06b6d4;
}
```

**作用域主题**（CSS 变量沿 DOM 继承——多主题共存）：

```html
<div style="--wf-color-primary: #f59e0b;">
  <!-- 此区域内组件使用金色主题，外部不受影响 -->
  <button class="wf-btn wf-btn--primary">金色按钮</button>
</div>
```

**全局语义变量**：直接覆盖 `--wf-*` 语义层：

```css
:root {
  --wf-radius: 8px;
  --wf-font-sans: 'Inter', system-ui, sans-serif;
}
```

## 暗色模式

两种激活方式（显式 `data-theme` 优先级高于系统偏好）：

```ts
document.documentElement.setAttribute('data-theme', 'dark')  // 手动切换
document.documentElement.setAttribute('data-theme', 'light') // 强制亮色
```

未设置 `data-theme` 时自动跟随系统偏好。所有 `--wf-*` 变量暗色自动切换；自定义暗色变量：

```css
[data-theme="dark"] {
  --wf-color-bg: #1a1a2e;
  --wf-color-text: #e0e0e0;
  --wf-color-border: #2a2a4a;
}

/* 系统自动暗色需与上面同步 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --wf-color-bg: #1a1a2e;
    --wf-color-text: #e0e0e0;
    --wf-color-border: #2a2a4a;
  }
}
```

## 状态层与表面层级（设计语言内建）

组件交互反馈统一走**状态层 token**（可覆盖定制）：

```
--wf-state-hover    rgba(0,0,0,.04)  亮色 / rgba(255,255,255,.06) 暗色
--wf-state-pressed  rgba(0,0,0,.08)  亮色 / rgba(255,255,255,.10) 暗色
--wf-state-selected 品牌浅底（--wf-color-primary-bg）
```

浮层（Modal/Drawer/Popover/Dropdown/Select/DatePicker 等）统一用
`--wf-color-bg-elevated` 面板底色——暗色下自动抬升一级（Material tonal elevation 思想）。

## 覆盖优先级（@layer）

`@layer tokens, base, layout, utilities, components`——你写的未分层 CSS 天然最高优先级；
也可用 `@layer utilities` 精准覆盖。

## 零自定义 CSS 模式（推荐）

一个项目只需要引用**一个 CSS 文件**（`weifuwu/components/style.css`，内含 Token + 布局原语 + 组件样式），
业务代码全部由组件 + `wf-*` 原语承担，**不需要再写 `style.css`**：

```tsx
// 组件 → 页面功能块；wf-* 原语 → 块之间的空间关系；--wf-* → 业务色值
<PageHeader title="仪表盘" sub="欢迎回来">
  <Button variant="primary">+ 新建</Button>
</PageHeader>
<div class="wf-row wf-gap-lg">
  <StatCard label="总用户" value="1,234" trend="up" trendLabel="12%" />
</div>
```

主题定制（品牌色/圆角/字体）不需要独立文件——**内联在 HTML 的 `<style>` 里即可**。
完整的零样式示例：`apps/components-demo`（组件 + 原语即插即用，无手写样式）。

诚实例外（合理场景，仍可内联 `<style>` 解决）：打印/PDF 导出规则、第三方库宿主样式、
业务特有的一次性视觉（如色板选择器交互）。

---
