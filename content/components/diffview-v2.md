# DiffView 标题 · components

## 概述

oldTitle/newTitle 标记版本对比（变体覆盖）

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<DiffView oldTitle="旧实现" newTitle="新实现" oldCode={...} newCode={...} />
```

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoDiffViewBig.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/diffview-v2` ——（P1 填充具体步骤）
