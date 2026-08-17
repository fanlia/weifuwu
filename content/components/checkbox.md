# Checkbox · components

## 概述

带 label 的复选框，支持 checked/disabled

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `checked` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `onChange` | `(checked: boolean) => void` | 否 |  |

## 用法示例

```tsx
<Checkbox label="同意"
  checked={agree}
  onChange={v => agree = v} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md)
- ↑ 用于应用：[todo](../apps/todo.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Checkbox/Checkbox.ts` |
| 样式 | `src/components/Checkbox/Checkbox.css` |
| 测试 | `src/components/Checkbox/Checkbox.test.ts` |
| demo | `apps/showcase/src/demos/DemoCheckbox.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/checkbox` ——（P1 填充具体步骤）
