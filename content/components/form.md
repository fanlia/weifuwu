# Form · components

## 概述

内置验证规则：required/pattern/minLength/自定义

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `onSubmit` | `(values: Record<string, any>) => void \| Promise<void>` | 否 | 提交回调，接收字段名→值的对象 |
| `validation` | `Record<string, ValidationRule[]>` | 否 | 验证规则：字段名 → 规则数组 |
| `onError` | `(errors: Record<string, string>) => void` | 否 | 验证失败时回调，接收字段名→错误消息的对象 |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Form
  validation={{
    email: {required: true, message: '必填'},
  }}
  onSubmit={values => ...}
  onError={errors => ...}>
  <Field label="邮箱" error={errors.email}>
    <Input name="email" />
  </Field>
  <Button type="submit">提交</Button>
</Form>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[todo](../apps/todo.md) · [auth](../apps/auth.md) · [admin](../apps/admin.md) · [agent-platform](../apps/agent-platform.md)
- → 后端能力：[sql](../backend/sql.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Form/Form.ts` |
| 样式 | `src/components/Form/Form.css` |
| 测试 | `src/components/Form/Form.test.ts` |
| demo | `apps/showcase/src/demos/DemoForm.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/form/form` ——（P1 填充具体步骤）
