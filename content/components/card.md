# Card · components

## 概述

容器，支持 default/outlined/clickable

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variant` | `'default' \| 'outlined'` | 否 |  |
| `outlined` | `boolean` | 否 | 便捷：outlined = variant 'outlined' |
| `padding` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `clickable` | `boolean` | 否 |  |
| `hover` | `boolean` | 否 | hover 抬升（阴影 + 上移），适合可点击/可悬停的卡片 |
| `active` | `boolean` | 否 | 选中态（边框高亮 + 品牌浅底），适合选择卡片 |
| `onClick` | `() => void` | 否 |  |
| `className` | `string` | 否 |  |
| `id` | `string` | 否 | id 属性（锚点定位——AgentDetail Tab 导航用） |
| `style` | `Record<string, string>` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Card>默认卡片</Card>
<Card variant="outlined">线框</Card>
<Card clickable>可点击</Card>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [focus-task](../patterns/focus-task.md) · [dashboard](../patterns/dashboard.md) · [data-screen](../patterns/data-screen.md) · [landing](../patterns/landing.md) · [list-page](../patterns/list-page.md) · [detail-page](../patterns/detail-page.md)
- ↑ 用于应用：[auth](../apps/auth.md) · [multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Card/Card.ts` |
| 样式 | `src/components/Card/Card.css` |
| 测试 | `src/components/Card/Card.test.ts` |
| demo | `apps/showcase/src/demos/DemoCardShowcase.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/card` ——（P1 填充具体步骤）
