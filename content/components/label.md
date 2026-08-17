# Label · components

## 概述

独立标签（required 星号）+ 宽高比容器（内容填满）

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `htmlFor` | `string` | 否 |  |
| `required` | `boolean` | 否 | 必填星号 |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Label htmlFor="name">用户名</Label>
<Label required>必填</Label>
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
| 源码 | `src/components/Label/Label.ts` |
| 样式 | `src/components/Label/Label.css` |
| 测试 | `src/components/Label/Label.test.ts` |
| demo | `apps/showcase/src/demos/DemoLabel.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/label` ——（P1 填充具体步骤）
