# Scrollbar · components

## 概述

自定义滚动容器：webkit 样式 + hover 显示

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `maxHeight` | `number \| string` | 否 |  |
| `height` | `number \| string` | 否 |  |
| `orientation` | `'vertical' \| 'horizontal'` | 否 |  |
| `always` | `boolean` | 否 | 常显滚动条（默认 hover 显示） |
| `children` | `any` | 否 |  |
| `style` | `any` | 否 |  |

## 用法示例

```tsx
<Scrollbar maxHeight={120}>长内容</Scrollbar>
```

## 纪律/坑

> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Scrollbar/Scrollbar.ts` |
| 样式 | `src/components/Scrollbar/Scrollbar.css` |
| 测试 | `src/components/Scrollbar/Scrollbar.test.ts` |
| demo | `apps/showcase/src/demos/DemoScrollbar.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/scrollbar` ——（P1 填充具体步骤）
