# Calendar 事件 · components

## 概述

事件标记 + 日期选择交互（变体覆盖）

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Calendar month={5} year={2025} selectedDate="2025-06-10"
  events={[{date:'2025-06-10',title:'需求评审'}]} onSelectDate={d => set(d)} />
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
| demo | `apps/showcase/src/demos/DemoCalendarEvents.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/calendar-v2` ——（P1 填充具体步骤）
