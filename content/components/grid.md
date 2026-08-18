# Grid · components

## 概述

24 栅格 + gutter + flex 容器模式（Row/Col/Flex 等价）

## 典型场景

- 基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `gutter` | `number` | 否 |  |
| `flex` | `boolean` | 否 |  |
| `gap` | `number` | 否 |  |
| `direction` | `'row' \| 'column'` | 否 |  |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Grid gutter={16}>
  <Col span={8}>A</Col><Col span={8}>B</Col><Col span={8}>C</Col>
</Grid>
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
| 源码 | `src/client/components/Grid/Grid.ts` |
| 样式 | `src/client/components/Grid/Grid.css` |
| 测试 | `src/client/components/Grid/Grid.test.ts` |
| demo | `apps/showcase/src/demos/DemoGrid.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/grid` ——（P1 填充具体步骤）
