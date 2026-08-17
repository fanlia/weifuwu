# VirtualList · components

## 概述

虚拟列表：spacer + 可见窗口，200 条只渲染 ~12 个 DOM

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `any[]` | 否 |  |
| `height` | `number` | 否 | 视口高度（px） |
| `itemHeight` | `number` | 否 | 固定 item 高度（px）——虚拟滚动的基础 |
| `renderItem` | `(item: any, index: number) => any` | 否 |  |
| `overscan` | `number` | 否 | 可见区外额外渲染数量 |
| `keyBy` | `(item: any, index: number) => string \| number` | 否 |  |
| `emptyText` | `string` | 否 | 空数据占位（F2 状态矩阵——容器类基线） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<VirtualList height={400} itemHeight={36}
  items={rows} renderItem={renderRow} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/VirtualList/VirtualList.ts` |
| 样式 | `src/components/VirtualList/VirtualList.css` |
| 测试 | `src/components/VirtualList/VirtualList.test.ts` |
| demo | `apps/showcase/src/demos/DemoVirtualList.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/virtuallist` ——（P1 填充具体步骤）
