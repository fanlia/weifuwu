# Badge · components

## 概述

状态标签 + 圆点，6 种 variant

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variant` | `BadgeVariant` | 否 |  |
| `dot` | `boolean` | 否 |  |
| `children` | `any` | 否 |  |
| `count` | `number` | 否 | 数值角标（与 children 互斥；超出 overflowCount 显示 N+） |
| `overflowCount` | `number` | 否 | 数值溢出阈值，默认 99（count > 阈值 → 阈值+） |
| `showZero` | `boolean` | 否 | count=0 时是否显示（默认 false 隐藏，antd showZero=false 语义） |

## 用法示例

```tsx
<Badge>默认</Badge>
<Badge variant="primary" />
<Badge variant="success" />
<Badge variant="danger" />
<Badge dot />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [dashboard](../patterns/dashboard.md) · [data-screen](../patterns/data-screen.md) · [landing](../patterns/landing.md) · [mobile](../patterns/mobile.md)
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Badge/Badge.ts` |
| 样式 | `src/components/Badge/Badge.css` |
| 测试 | `src/components/Badge/Badge.test.ts` |
| demo | `apps/showcase/src/demos/DemoBadge.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/badge` ——（P1 填充具体步骤）
