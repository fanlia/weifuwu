# HoverCard · components

## 概述

悬停富内容卡：openDelay 延迟 + 任意 VNode（shadcn）

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `any` | 是 | 富内容（任意 VNode，区别于 Tooltip 的 string） |
| `position` | `HoverCardPosition` | 否 |  |
| `children` | `any` | 是 |  |
| `disabled` | `boolean` | 否 |  |
| `openDelay` | `number` | 否 | 悬停打开延迟（ms），默认 150 |
| `closeDelay` | `number` | 否 | 移出关闭延迟（ms），默认 0 |

## 用法示例

```tsx
<HoverCard content={<UserCard />}>
  <Button>悬停</Button>
</HoverCard>
```

## 纪律/坑

- portal 槽豁免：浮层插槽打开/关闭不触发 A 级动态数组检测（框架管理切换槽）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/HoverCard/HoverCard.ts` |
| 样式 | `src/components/HoverCard/HoverCard.css` |
| 测试 | `src/components/HoverCard/HoverCard.test.ts` |
| demo | `apps/showcase/src/demos/DemoHoverCard.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/hovercard` ——（P1 填充具体步骤）
