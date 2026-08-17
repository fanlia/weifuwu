# Form 提交 · components

## 概述

loading 提交 + 校验错误（状态矩阵覆盖）

## 典型场景

- 创建/编辑表单页——提交、校验、字段编排

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Form validation={{name:[{required:true,minLength:2}]}}
  onSubmit={submit}><Field label="项目名称" required><Input name="name" /></Field>
  <Button type="submit" loading={loading}>提交</Button></Form>
```

## 纪律/坑

> 受控纪律（§5.2）：受控 props 必须配回调——缺回调静默不可点；受控输入（§5.3）输入态不依赖 value 回流（焦点丢失）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoFormSubmit.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/form/form-v2` ——（P1 填充具体步骤）
