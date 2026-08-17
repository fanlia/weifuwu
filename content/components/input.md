# Input · components

## 概述

text/email/password/number，支持 label/error/hint/required

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `name` | `string` | 否 |  |
| `type` | `'text' \| 'email' \| 'password' \| 'number' \| 'url' \| 'date' \| 'tel' \| 'time' \| 'color'` | 否 |  |
| `value` | `string` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `readonly` | `boolean` | 否 | 只读（不可编辑但可复制） |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `variant` | `'default' \| 'borderless'` | 否 | 边框变体：borderless 用于可编辑标题/内联编辑（hover/focus 才显边框） |
| `onInput` | `(e: Event) => void` | 否 |  |
| `onChange` | `(e: Event) => void` | 否 |  |
| `min` | `string \| number` | 否 | 原生 input 属性透传（type=number 时 min/max/step 等） |
| `max` | `string \| number` | 否 |  |
| `step` | `string \| number` | 否 |  |

## 用法示例

```tsx
<Input label="文本" value={text}
  onInput={e => text = e.target.value} />
<Input label="邮箱" type="email" required />
<Input error="错误提示" />
<Input hint="辅助文字" />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[todo](../apps/todo.md) · [auth](../apps/auth.md) · [multi](../apps/multi.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Input/Input.ts` |
| 样式 | `src/components/Input/Input.css` |
| 测试 | `src/components/Input/Input.test.ts` |
| demo | `apps/showcase/src/demos/DemoInput.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/input` ——（P1 填充具体步骤）
