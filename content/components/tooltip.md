# Tooltip · components

## 概述

hover 浮动提示，4 方向

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 |  |
| `position` | `TooltipPosition` | 否 |  |
| `children` | `any` | 是 |  |
| `disabled` | `boolean` | 否 |  |

## 用法示例

```tsx
<Tooltip content="保存"
  position="top">
  <Button>保存</Button>
</Tooltip>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Tooltip/Tooltip.ts` |
| 样式 | `src/components/Tooltip/Tooltip.css` |
| 测试 | `src/components/Tooltip/Tooltip.test.ts` |
| demo | `apps/showcase/src/demos/DemoTooltip.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/tooltip` ——（P1 填充具体步骤）
