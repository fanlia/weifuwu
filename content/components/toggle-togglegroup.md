# Toggle / ToggleGroup · components

## 概述

切换按钮：single/multiple 双模式（shadcn 对齐）

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pressed` | `boolean` | 否 | 按下状态（受控） |
| `onPressedChange` | `(pressed: boolean) => void` | 否 |  |
| `variant` | `'default' \| 'outline'` | 否 |  |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<ToggleGroup type="single" options={[{value:'b',label:'B'}]} />
<ToggleGroup type="multiple" />
<Toggle pressed>单个</Toggle>
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
| 源码 | `src/client/components/ToggleGroup/ToggleGroup.ts` |
| 样式 | `src/client/components/ToggleGroup/ToggleGroup.css` |
| 测试 | `src/client/components/ToggleGroup/ToggleGroup.test.ts` |
| demo | `apps/showcase/src/demos/DemoToggleGroup.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/toggle-togglegroup` ——（P1 填充具体步骤）
