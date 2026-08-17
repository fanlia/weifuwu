# Select · components

## 概述

原生下拉选择器

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 |  |
| `value` | `string \| string[]` | 否 |  |
| `options` | `SelectOptions` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `required` | `boolean` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `onChange` | `(value: string \| string[]) => void` | 否 |  |
| `children` | `any` | 否 |  |
| `searchable` | `boolean` | 否 | 启用搜索过滤 |
| `multiple` | `boolean` | 否 | 多选模式（searchable 下生效；value/onChange 为数组） |
| `onSearch` | `(keyword: string) => SelectOption[] \| Promise<SelectOption[]>` | 否 | 异步搜索回调，返回值作为新选项列表 |

## 用法示例

```tsx
<Select label="角色" value={role}
  onChange={v => role = v}
  options={[
    {value:'admin',label:'管理员'},
  ]} />
{/* searchable 搜索过滤 */}
<Select searchable
  options={options}
  onChange={v => setVal(v)} />
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[settings-page](../patterns/settings-page.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Select/Select.ts` |
| 样式 | `src/components/Select/Select.css` |
| 测试 | `src/components/Select/Select.test.ts` |
| demo | `apps/showcase/src/demos/DemoSelect.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/select` ——（P1 填充具体步骤）
