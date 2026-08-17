# Kanban · components

## 概述

看板：原生 DnD 拖拽 + 跨列/重排 + 悬停高亮

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `columns` | `KanbanColumn[]` | 是 |  |
| `onMove` | `(from: KanbanMove, to: KanbanMove) => void` | 否 | 受控：移动回调（from → to）。缺回调交互静默失效——受控纪律 warn |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Kanban columns={cols} onMove={(from, to) => {}} />
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
| 源码 | `src/components/Kanban/Kanban.ts` |
| 样式 | `src/components/Kanban/Kanban.css` |
| 测试 | `src/components/Kanban/Kanban.test.ts` |
| demo | `apps/showcase/src/demos/DemoKanban.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/viz/kanban` ——（P1 填充具体步骤）
