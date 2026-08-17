# Descriptions · components

## 概述

描述列表：label/value 栅格 + bordered + span（详情页）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `DescriptionItem[]` | 是 |  |
| `column` | `1 \| 2 \| 3 \| 4` | 否 |  |
| `bordered` | `boolean` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Descriptions column={2} items={[
  { label: '名称', value: '小码' },
  { label: '状态', value: <Badge variant="success">运行中</Badge> },
]} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[workspace](../patterns/workspace.md) · [detail-page](../patterns/detail-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Descriptions/Descriptions.ts` |
| 样式 | `src/components/Descriptions/Descriptions.css` |
| 测试 | `src/components/Descriptions/Descriptions.test.ts` |
| demo | `apps/showcase/src/demos/DemoDescriptions.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/descriptions` ——（P1 填充具体步骤）
