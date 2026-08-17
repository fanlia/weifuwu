# Icon · components

## 概述

stroke SVG 图标集，currentColor 着色，随字号缩放

## 典型场景

- 页面模式：app-shell、workspace、focus-task、docs、dashboard、data-screen、landing、mobile、list-page（复制即用蓝本——examples/patterns/）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `IconName` | 是 |  |
| `size` | `number \| string` | 否 | 尺寸，默认 1em（随字号缩放） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Icon name="check" size={16} />
<Icon name="search" />
<Icon name="settings" size={20} />
{/* stroke SVG · currentColor · 1em 随字号 */}
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [workspace](../patterns/workspace.md) · [focus-task](../patterns/focus-task.md) · [docs](../patterns/docs.md) · [dashboard](../patterns/dashboard.md) · [data-screen](../patterns/data-screen.md) · [landing](../patterns/landing.md) · [mobile](../patterns/mobile.md) · [list-page](../patterns/list-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Icon/Icon.ts` |
| 样式 | `src/components/Icon/Icon.css` |
| 测试 | `src/components/Icon/Icon.test.ts` |
| demo | `apps/showcase/src/demos/DemoIcon.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/icon` ——（P1 填充具体步骤）
