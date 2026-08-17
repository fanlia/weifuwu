# InfiniteScroll · components

## 概述

无限滚动：底部哨兵触底加载 + loading/end 态

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hasMore` | `boolean` | 否 |  |
| `loading` | `boolean` | 否 |  |
| `onLoadMore` | `() => void` | 否 | 触底加载回调（sentinel 进入视口触发） |
| `threshold` | `number` | 否 | 提前触发距离（px） |
| `children` | `any` | 否 |  |
| `loadMoreText` | `string` | 否 |  |
| `endText` | `string` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<InfiniteScroll hasMore loading={loading}
  onLoadMore={loadMore}>
  {items.map(i => <div>{i}</div>)}
</InfiniteScroll>
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
| 源码 | `src/components/InfiniteScroll/InfiniteScroll.ts` |
| 样式 | `src/components/InfiniteScroll/InfiniteScroll.css` |
| 测试 | `src/components/InfiniteScroll/InfiniteScroll.test.ts` |
| demo | `apps/showcase/src/demos/DemoInfiniteScroll.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/infinitescroll` ——（P1 填充具体步骤）
