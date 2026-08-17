# Select · components

## 概述

原生下拉选择器

## 典型场景

- 页面模式：settings-page（复制即用蓝本——examples/patterns/）
- 表单输入/搜索/筛选——查询区、编辑表单、设置页

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

- 受控输入纪律：searchable 输入焦点丢失——useControlledInput 内部态
- 事件 prop 判定：on+大写（EVENT_RE）——once/only 等 on 开头属性防误判
- 浮层必须 portal（§5.4）——absolute 相对父容器在 overflow 下裁剪

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
