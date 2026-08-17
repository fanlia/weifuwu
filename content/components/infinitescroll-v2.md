# InfiniteScroll 失败重试 · components

## 概述

加载失败提示 + 滚动重试（状态矩阵覆盖）

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<InfiniteScroll hasMore loading onLoadMore={加载}
  endText="已全部加载">...</InfiniteScroll>
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
| demo | `apps/showcase/src/demos/DemoInfiniteScrollRetry.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/infinitescroll-v2` ——（P1 填充具体步骤）
