# Space · components

## 概述

间距容器：size/direction/wrap + split 分隔符

## 典型场景

- 页面模式：app-shell、workspace、focus-task、docs、dashboard、data-screen、landing、mobile、detail-page、settings-page（复制即用蓝本——examples/patterns/）
- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `size` | `number \| 'sm' \| 'md' \| 'lg'` | 否 |  |
| `direction` | `'horizontal' \| 'vertical'` | 否 |  |
| `wrap` | `boolean` | 否 |  |
| `align` | `'start' \| 'center' \| 'end' \| 'baseline'` | 否 |  |
| `split` | `any` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Space split={<Divider vertical />}>
  <span>一</span><span>二</span><span>三</span>
</Space>
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [workspace](../patterns/workspace.md) · [focus-task](../patterns/focus-task.md) · [docs](../patterns/docs.md) · [dashboard](../patterns/dashboard.md) · [data-screen](../patterns/data-screen.md) · [landing](../patterns/landing.md) · [mobile](../patterns/mobile.md) · [detail-page](../patterns/detail-page.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Space/Space.ts` |
| 样式 | `src/client/components/Space/Space.css` |
| 测试 | `src/client/components/Space/Space.test.ts` |
| demo | `apps/showcase/src/demos/DemoSpace.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/space` ——（P1 填充具体步骤）
