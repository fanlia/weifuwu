# Skeleton · components

## 概述

text/circle/rect/image/avatar/table 六种变体

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variant` | `SkeletonVariant` | 否 |  |
| `lines` | `number` | 否 |  |
| `cols` | `number` | 否 |  |
| `width` | `number \| string` | 否 |  |
| `height` | `number \| string` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Skeleton />
<Skeleton lines={3} />
<Skeleton variant="avatar" />
<Skeleton variant="image" />
<Skeleton variant="table" lines={3} cols={4} />
<Skeleton variant="circle" width={40} height={40} />
<Skeleton variant="rect" width="100%" height={100} />
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
| 源码 | `src/components/Skeleton/Skeleton.ts` |
| 样式 | `src/components/Skeleton/Skeleton.css` |
| 测试 | `src/components/Skeleton/Skeleton.test.ts` |
| demo | `apps/showcase/src/demos/DemoSkeleton.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/skeleton` ——（P1 填充具体步骤）
