# CheckboxGroup · components

## 概述

复选框组：数组受控 + 栅格列数（antd Checkbox.Group）

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `CheckboxGroupOption[]` | 否 |  |
| `value` | `string[]` | 否 | 受控选中值 |
| `onChange` | `(value: string[]) => void` | 否 |  |
| `columns` | `1 \| 2 \| 3 \| 4` | 否 | 栅格列数（1-4） |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `label` | `string` | 否 | 组标题（可选） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<CheckboxGroup options={[{value:'a',label:'A'}]}
  value={selected} onChange={setSelected} />
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
| 源码 | `src/client/components/CheckboxGroup/CheckboxGroup.ts` |
| 样式 | `src/client/components/CheckboxGroup/CheckboxGroup.css` |
| 测试 | `src/client/components/CheckboxGroup/CheckboxGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoCheckboxGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/checkboxgroup` ——（P1 填充具体步骤）
