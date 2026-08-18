# Pagination · components

## 概述

分页器，自动计算页码范围

## 典型场景

- 页面模式：app-shell、list-page（复制即用蓝本——examples/patterns/）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `total` | `number` | 是 |  |
| `page` | `number` | 否 |  |
| `pageSize` | `number` | 否 |  |
| `onChange` | `(page: number) => void` | 否 |  |

## 用法示例

```tsx
<Pagination total={200}
  page={page} onChange={fn} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [list-page](../patterns/list-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Pagination/Pagination.ts` |
| 样式 | `src/client/components/Pagination/Pagination.css` |
| 测试 | `src/client/components/Pagination/Pagination.test.ts` |
| demo | `apps/showcase/src/demos/DemoPagination.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/pagination` ——（P1 填充具体步骤）
