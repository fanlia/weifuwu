# StatCard · components

## 概述

KPI 指标卡，支持 trend/icon

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 是 |  |
| `value` | `string \| number` | 否 | 展示值——countdown 模式下可选（显示剩余时间） |
| `trend` | `'up' \| 'down'` | 否 |  |
| `trendLabel` | `string` | 否 |  |
| `icon` | `string \| VNode \| null` | 否 | 图标——字符串（emoji/字形）或 VNode（推荐 <Icon name=... />，禁 emoji 装饰的场景用后者） |
| `onClick` | `() => void` | 否 | 点击跳转/交互（悬停抬升 + role=button） |
| `animate` | `boolean` | 否 | 数字从 0 递增动画（reduced-motion 下直接终值），仅数值类型生效 |
| `countdown` | `number` | 否 | 倒计时目标时间戳（ms）——显示剩余 HH:MM:SS（antd Statistic.Countdown 等价） |
| `onFinish` | `() => void` | 否 | 倒计时结束回调 |

## 用法示例

```tsx
<StatCard label="用户"
  value="1,234" icon={<Icon name="users" />}
  trend="up" trendLabel="12%" />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [dashboard](../patterns/dashboard.md) · [data-screen](../patterns/data-screen.md)
- ↑ 用于应用：[admin](../apps/admin.md) · [agent-platform](../apps/agent-platform.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/StatCard/StatCard.ts` |
| 样式 | `src/components/StatCard/StatCard.css` |
| 测试 | `src/components/StatCard/StatCard.test.ts` |
| demo | `apps/showcase/src/demos/DemoStatCard.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/viz/statcard` ——（P1 填充具体步骤）
