# JsonSchemaForm · components

## 概述

JSON Schema → 参数输入表单：类型映射 + 必填/范围校验 + 嵌套/数组（AI 工具参数输入面）

## 典型场景

- 创建/编辑表单页——提交、校验、字段编排

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema` | `JsonSchema` | 是 | 顶层对象 schema（type: 'object' + properties） |
| `value` | `Record<string, any>` | 否 | 初始值（非受控语义）；内部状态由编辑驱动 |
| `onChange` | `(values: Record<string, any>) => void` | 否 | 每次编辑通知（父层可读最新值；不回流控制） |
| `onSubmit` | `(values: Record<string, any>) => void` | 否 | 提交（校验通过才触发）；不传则不渲染提交按钮 |
| `submitLabel` | `string` | 否 |  |

## 用法示例

```tsx
<JsonSchemaForm
  schema={toolSchema}
  value={{ city: '北京' }}
  onSubmit={(v) => console.log('执行', v)}
  submitLabel="执行工具"
/>
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
| 源码 | `src/client/components/JsonSchemaForm/JsonSchemaForm.ts` |
| 样式 | `src/client/components/JsonSchemaForm/JsonSchemaForm.css` |
| 测试 | `src/client/components/JsonSchemaForm/JsonSchemaForm.test.ts` |
| demo | `apps/showcase/src/demos/DemoJsonSchemaForm.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/form/jsonschemaform` ——（P1 填充具体步骤）
