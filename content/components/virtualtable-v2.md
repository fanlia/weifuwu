# VirtualTable 大数据 · components

## 概述

10 万行虚拟滚动（只渲染可见窗口——性能展示）

## 典型场景

- 大数据列表/表格/树——千级+数据量的性能场景

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<VirtualTable height={280} data={100000行大数据} columns={[{key:'id',label:'ID'}]} />
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
| demo | `apps/showcase/src/demos/DemoVirtualTableBig.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/virtualtable-v2` ——（P1 填充具体步骤）
