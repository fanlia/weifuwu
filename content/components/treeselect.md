# TreeSelect · components

## 概述

树形选择：单选/多选（父子联动）+ 选中 label 回显 + 受控纪律

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `TreeNode[]` | 是 | 树选项（复用 TreeNode 结构） |
| `value` | `string \| string[]` | 否 | 受控：单选 string / 多选 string[] |
| `onChange` | `(value: any) => void` | 否 | 受控回调：单选 key / 多选 keys[] |
| `multiple` | `boolean` | 否 | 多选（checkable 父子联动语义） |
| `placeholder` | `string` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `error` | `string` | 否 |  |
| `virtual` | `boolean` | 否 | 虚拟滚动（大数据树——透传 Tree；固定行高 28） |
| `height` | `number` | 否 | 虚拟滚动视口高度（px） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<TreeSelect options={options} value={value} onChange={setValue} />
```

## 纪律/坑

- 弹窗纪律（§5.4）：曾遗漏 portal——absolute 在父容器 overflow/transform 下裁剪/错位——统一 usePopup
- 选项量小场景搜索过滤已裁剪（components-cuts.md 永久裁剪）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/TreeSelect/TreeSelect.ts` |
| 样式 | `src/client/components/TreeSelect/TreeSelect.css` |
| 测试 | `src/client/components/TreeSelect/TreeSelect.test.ts` |
| demo | `apps/showcase/src/demos/DemoTreeSelect.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/treeselect` ——（P1 填充具体步骤）
