# Timeline · components

## 概述

时间线：节点状态色 + 时间 + 内容（执行日志/审批历史）

## 典型场景

- 页面模式：detail-page（复制即用蓝本——examples/patterns/）
- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `TimelineItem[]` | 是 |  |
| `mode` | `'left' \| 'alternate' \| 'horizontal'` | 否 |  |
| `reverse` | `boolean` | 否 |  |

## 用法示例

```tsx
<Timeline items={[
  { key: '1', title: 'AI 回复', time: '10:00', status: 'success', content: '…' },
  { key: '2', title: '工具调用', time: '10:00', status: 'info' },
]} />
```

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：[detail-page](../patterns/detail-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Timeline/Timeline.ts` |
| 样式 | `src/components/Timeline/Timeline.css` |
| 测试 | `src/components/Timeline/Timeline.test.ts` |
| demo | `apps/showcase/src/demos/DemoTimeline.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/timeline` ——（P1 填充具体步骤）
