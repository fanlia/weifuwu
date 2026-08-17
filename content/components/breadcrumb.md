# Breadcrumb · components

## 概述

面包屑导航，支持 aria-current

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `BreadcrumbItem[]` | 是 |  |

## 用法示例

```tsx
<Breadcrumb items={[
  { label: '首页', href: '/' },
  { label: '用户管理' },
  { label: '编辑' },
]} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[docs](../patterns/docs.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Breadcrumb/Breadcrumb.ts` |
| 样式 | `src/components/Breadcrumb/Breadcrumb.css` |
| 测试 | `src/components/Breadcrumb/Breadcrumb.test.ts` |
| demo | `apps/showcase/src/demos/DemoBreadcrumb.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/breadcrumb` ——（P1 填充具体步骤）
