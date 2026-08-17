# DatePicker · components

## 概述

日期选择器，四种模式：date/datetime/time/range

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `DatePickerMode` | 否 |  |
| `value` | `string` | 否 |  |
| `onChange` | `(value: string) => void` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 | 错误态（F2 状态矩阵——输入类基线） |

## 用法示例

```tsx
<DatePicker mode="date" onChange={v => ...} />
<DatePicker mode="datetime" />
<DatePicker mode="time" />
<DatePicker mode="range" />
```

## 纪律/坑

- 受控纪律：受控 value/month 必须配回调——缺回调静默不可点

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/DatePicker/DatePicker.ts` |
| 样式 | `src/components/DatePicker/DatePicker.css` |
| 测试 | `src/components/DatePicker/DatePicker.test.ts` |
| demo | `apps/showcase/src/demos/DemoDatePicker.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/datepicker` ——（P1 填充具体步骤）
