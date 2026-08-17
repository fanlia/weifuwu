# VirtualTable · components

## 概述

虚拟表格：10k 行固定表头 + 可见窗口渲染 + 排序

## 典型场景

- 大数据列表/表格/树——千级+数据量的性能场景

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `columns` | `TableColumn[]` | 是 |  |
| `data` | `any[]` | 否 |  |
| `height` | `number` | 否 | 视口高度（px），默认 400 |
| `rowHeight` | `number` | 否 | 行高（px），默认 40 |
| `overscan` | `number` | 否 | 可见区外额外渲染行数 |
| `sortKey` | `string` | 否 | 当前排序列 key |
| `sortOrder` | `'asc' \| 'desc'` | 否 | 当前排序方向 |
| `onSort` | `(key: string, order: 'asc' \| 'desc') => void` | 否 | 排序变化回调 |
| `emptyText` | `string` | 否 | 数据为空时显示的文本 |
| `onRowClick` | `(row: any, index: number) => void` | 否 | 行点击 |
| `className` | `string` | 否 | 行 key 字段名，默认 'id'；无该字段回退到索引 |

## 用法示例

```tsx
<VirtualTable columns={cols} data={rows} height={320}
  sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
```

## 纪律/坑

> 大数据渲染：固定行高 + 窗口化（VirtualList）——动态高度裁剪登记

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/VirtualTable/VirtualTable.ts` |
| 样式 | `src/components/VirtualTable/VirtualTable.css` |
| 测试 | `src/components/VirtualTable/VirtualTable.test.ts` |
| demo | `apps/showcase/src/demos/DemoVirtualTable.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/virtualtable` ——（P1 填充具体步骤）
