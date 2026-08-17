# Calendar · components

## 概述

月历：事件点 + 月切换 + 日期选择（antd/EP Calendar）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `events` | `CalendarEvent[]` | 否 |  |
| `month` | `number` | 否 | 受控年月：month 0-11，year 四位数 |
| `year` | `number` | 否 |  |
| `onMonthChange` | `(month: number, year: number) => void` | 否 |  |
| `onSelectDate` | `(date: string) => void` | 否 |  |
| `selectedDate` | `string` | 否 |  |

## 用法示例

```tsx
<Calendar month={5} year={2025}
  events={events} selectedDate="2025-06-10" />
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
| 源码 | `src/components/Calendar/Calendar.ts` |
| 样式 | `src/components/Calendar/Calendar.css` |
| 测试 | `src/components/Calendar/Calendar.test.ts` |
| demo | `apps/showcase/src/demos/DemoCalendar.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/calendar` ——（P1 填充具体步骤）
