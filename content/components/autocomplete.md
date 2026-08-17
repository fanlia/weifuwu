# AutoComplete · components

## 概述

输入联想：自由输入 + 过滤下拉 + 键盘流 + 选中回填

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

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
