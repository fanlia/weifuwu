# Field · components

## 概述

label+error+hint 容器

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Field label="姓名" required>
  <Input />
</Field>
<Field error="错误信息">
  <Input />
</Field>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Field/Field.ts` |
| 样式 | `src/components/Field/Field.css` |
| 测试 | `src/components/Field/Field.test.ts` |
| demo | `apps/showcase/src/demos/DemoField.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/form/field` ——（P1 填充具体步骤）
