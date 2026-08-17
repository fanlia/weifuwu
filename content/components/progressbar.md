# ProgressBar · components

## 概述

进度条，支持 label/showValue

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number` | 否 | 进度值；undefined = indeterminate（不确定态，动画扫动） |
| `max` | `number` | 否 |  |
| `label` | `string` | 否 |  |
| `showValue` | `boolean` | 否 |  |
| `status` | `'default' \| 'success' \| 'error' \| 'warning'` | 否 | 状态色（default/success/error/warning） |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 | 尺寸 |

## 用法示例

```tsx
<ProgressBar value={75} label="进度" showValue />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[dashboard](../patterns/dashboard.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/ProgressBar/ProgressBar.ts` |
| 样式 | `src/components/ProgressBar/ProgressBar.css` |
| 测试 | `src/components/ProgressBar/ProgressBar.test.ts` |
| demo | `apps/showcase/src/demos/DemoProgress.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/progressbar` ——（P1 填充具体步骤）
