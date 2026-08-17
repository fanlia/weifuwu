# AutoComplete · components

## 概述

输入联想：自由输入 + 过滤下拉 + 键盘流 + 选中回填

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `AutoCompleteOption[]` | 是 |  |
| `value` | `string` | 否 |  |
| `onChange` | `(value: string) => void` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `open` | `boolean` | 否 |  |
| `onOpenChange` | `(open: boolean) => void` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 | 错误态（F2 状态矩阵——输入类基线） |
| `filter` | `(options: AutoCompleteOption[], query: string) => AutoCompleteOption[]` | 否 | 过滤函数（默认包含匹配） |
| `renderOption` | `(option: AutoCompleteOption) => any` | 否 |  |
| `onSelect` | `(value: string, option: AutoCompleteOption) => void` | 否 |  |

## 用法示例

```tsx
<AutoComplete options={options}
  value={query} onChange={setQuery} />
```

## 纪律/坑

- 受控输入纪律（§5.3）：受控 input 焦点丢失事故——输入期间 value 走内部 keyword（useControlledInput），不依赖受控 value 回流
- IME composition：中文输入组合期间受控 value 重置打断——isComposing 门控

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/AutoComplete/AutoComplete.ts` |
| 样式 | `src/components/AutoComplete/AutoComplete.css` |
| 测试 | `src/components/AutoComplete/AutoComplete.test.ts` |
| demo | `apps/showcase/src/demos/DemoAutoComplete.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/autocomplete` ——（P1 填充具体步骤）
