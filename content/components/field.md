# Field · components

## 概述

label+error+hint 容器

## 典型场景

- 页面模式：focus-task、settings-page（复制即用蓝本——examples/patterns/）
- 创建/编辑表单页——提交、校验、字段编排

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

> 受控纪律（§5.2）：受控 props 必须配回调——缺回调静默不可点；受控输入（§5.3）输入态不依赖 value 回流（焦点丢失）

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
