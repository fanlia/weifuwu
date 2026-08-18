# RadioGroup · components

## 概述

单选组，支持 inline/options/value

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 否 |  |
| `value` | `string` | 否 |  |
| `options` | `RadioOption[]` | 否 |  |
| `inline` | `boolean` | 否 |  |
| `onChange` | `(value: string) => void` | 否 |  |

## 用法示例

```tsx
<RadioGroup name="gender"
  value={gender}
  onChange={v => gender = v}
  options={[
    {value:'male',label:'男'},
  ]} />
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
| 源码 | `src/client/components/RadioGroup/RadioGroup.ts` |
| 样式 | `src/client/components/RadioGroup/RadioGroup.css` |
| 测试 | `src/client/components/RadioGroup/RadioGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoRadio.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/radiogroup` ——（P1 填充具体步骤）
