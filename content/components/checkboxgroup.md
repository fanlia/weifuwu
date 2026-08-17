# CheckboxGroup · components

## 概述

复选框组：数组受控 + 栅格列数（antd Checkbox.Group）

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/CheckboxGroup/CheckboxGroup.ts` |
| 样式 | `src/components/CheckboxGroup/CheckboxGroup.css` |
| 测试 | `src/components/CheckboxGroup/CheckboxGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoCheckboxGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/checkboxgroup` ——（P1 填充具体步骤）
