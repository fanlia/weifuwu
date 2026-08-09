# 样式定制指南

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## 组件定制钩子（零覆盖 CSS）

关键组件视觉全部变量化——定制只需设一个变量（默认值 = 现有 token）：

```html
<style>
  :root {
    --wf-brand-500: #7c3aed;      /* 品牌换色：改原始层一个值，全站跟随 */
    --wf-dark-brand-500: #a78bfa; /* 暗色品牌（可选） */
    --wf-modal-width: 640px;      /* 组件定制：设一个变量 */
    --wf-btn-radius: 999px;
    --wf-field-height: 44px;
    --wf-card-shadow: 0 8px 24px rgba(0,0,0,.12);
  }
</style>
```

钩子清单：`--wf-btn-*` `--wf-card-*` `--wf-field-*` `--wf-modal-*` `--wf-drawer-width` `--wf-toast-*` `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` `--wf-switch-radius` `--wf-popover-*` `--wf-tooltip-radius` `--wf-dropdown-min-width` `--wf-datepicker-*`。

**覆盖优先级（@layer）**：`@layer tokens, base, layout, utilities, components`——你写的未分层 CSS 天然最高优先级；也可用 `@layer utilities` 精准覆盖我们。

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

主题定制（品牌色/圆角/字体）不需要独立文件——**内联在 HTML 的 `<style>` 里即可**：

```html
<style>
  :root {
    --wf-color-primary: #6366f1;
    --wf-radius: 8px;
  }
</style>
```

完整的零样式示例：`apps/components-demo`（组件 + 原语即插即用，无手写样式）。

诚实例外（合理场景，仍可内联 `<style>` 解决）：打印/PDF 导出规则、第三方库宿主样式、
业务特有的一次性视觉（如色板选择器交互）。

## 全局主题变量

所有组件引用 `--wf-*` CSS 变量。在根元素覆盖即可定制主题：

```css
:root {
  --wf-color-primary: #6366f1;
  --wf-color-primary-hover: #4f46e5;
  --wf-radius: 8px;
  --wf-font-sans: 'Inter', system-ui, sans-serif;
}
```

## 暗色模式

两种激活方式（显式 `data-theme` 优先级高于系统偏好）：

```ts
// 手动切换
document.documentElement.setAttribute('data-theme', 'dark')

// 强制亮色（系统为暗色时也保持亮色）
document.documentElement.setAttribute('data-theme', 'light')
```

未设置 `data-theme` 时，自动跟随系统偏好：`@media (prefers-color-scheme: dark)` 下自动切换暗色。

所有 `--wf-*` 变量在暗色下自动切换。可自定义暗色变量：

```css
[data-theme="dark"] {
  --wf-color-bg: #1a1a2e;
  --wf-color-text: #e0e0e0;
  --wf-color-border: #2a2a4a;
}

/* 自定义系统自动暗色的变量（需与上面同步） */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --wf-color-bg: #1a1a2e;
    --wf-color-text: #e0e0e0;
    --wf-color-border: #2a2a4a;
  }
}
```

## 组件级覆盖

```css
/* 覆盖 Button 主色 */
.wf-btn--primary {
  background: #06b6d4;
  border-color: #06b6d4;
}

/* 覆盖 Modal 圆角 */
.wf-modal-content {
  border-radius: 16px;
}
```

## 作用域主题

```html
<div style="--wf-color-primary: #f59e0b;">
  <!-- 此区域内组件使用金色主题，外部不受影响 -->
  <button class="wf-btn wf-btn--primary">金色按钮</button>
</div>
```

CSS 变量会沿 DOM 树继承，利用这一点可实现多主题共存。

---

