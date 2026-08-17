# Textarea · components

## 概述

多行文本，支持 rows/label/error/hint

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `value` | `string` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `hint` | `string` | 否 |  |
| `rows` | `number` | 否 |  |
| `maxLength` | `number` | 否 | 最大字符数（同时限制输入） |
| `showCount` | `boolean` | 否 | 显示字数统计（右下角；配合受控 value 实时更新） |
| `onInput` | `(e: Event) => void` | 否 |  |

## 用法示例

```tsx
<Textarea label="简介" rows={3}
  value={bio}
  onInput={e => bio = e.target.value} />
<Textarea error="错误" />
```

## 纪律/坑

> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Textarea/Textarea.ts` |
| 样式 | `src/components/Textarea/Textarea.css` |
| 测试 | `src/components/Textarea/Textarea.test.ts` |
| demo | `apps/showcase/src/demos/DemoTextarea.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/textarea` ——（P1 填充具体步骤）
