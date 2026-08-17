# Breadcrumb · components

## 概述

面包屑导航，支持 aria-current

## 典型场景

- 页面模式：docs（复制即用蓝本——examples/patterns/）
- 页面导航——侧栏、页头、标签页、步骤、分页

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

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

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
