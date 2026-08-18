# Checkbox · components

## 概述

带 label 的复选框，支持 checked/disabled

## 典型场景

- 页面模式：focus-task（复制即用蓝本——examples/patterns/）
- 应用模板：todo（examples/apps/ 完整可跑）
- 表单输入/搜索/筛选——查询区、编辑表单、设置页

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

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md)
- ↑ 用于应用：[todo](../apps/todo.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Checkbox/Checkbox.ts` |
| 样式 | `src/client/components/Checkbox/Checkbox.css` |
| 测试 | `src/client/components/Checkbox/Checkbox.test.ts` |
| demo | `apps/showcase/src/demos/DemoCheckbox.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/checkbox` ——（P1 填充具体步骤）
