# Divider · components

## 概述

分割线，支持 horizontal/vertical/带文字

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `vertical` | `boolean` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Divider />
<Divider vertical />
<Divider>或</Divider>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [workspace](../patterns/workspace.md) · [focus-task](../patterns/focus-task.md) · [docs](../patterns/docs.md) · [dashboard](../patterns/dashboard.md) · [landing](../patterns/landing.md) · [mobile](../patterns/mobile.md) · [detail-page](../patterns/detail-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Divider/Divider.ts` |
| 样式 | `src/components/Divider/Divider.css` |
| 测试 | `src/components/Divider/Divider.test.ts` |
| demo | `apps/showcase/src/demos/DemoDivider.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/divider` ——（P1 填充具体步骤）
