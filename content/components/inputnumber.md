# InputNumber · components

## 概述

数字输入：min/max/step + 增减按钮 + precision

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number \| null` | 否 |  |
| `onChange` | `(value: number \| null) => void` | 否 |  |
| `min` | `number` | 否 |  |
| `max` | `number` | 否 |  |
| `step` | `number` | 否 |  |
| `precision` | `number` | 否 |  |
| `label` | `string` | 否 |  |
| `name` | `string` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<InputNumber value={0.7} min={0} max={1} step={0.1} precision={1}
  onChange={v => setTemp(v)} />
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
| 源码 | `src/components/InputNumber/InputNumber.ts` |
| 样式 | `src/components/InputNumber/InputNumber.css` |
| 测试 | `src/components/InputNumber/InputNumber.test.ts` |
| demo | `apps/showcase/src/demos/DemoInputNumber.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/inputnumber` ——（P1 填充具体步骤）
