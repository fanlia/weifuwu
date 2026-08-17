# Tree · components

## 概述

树形：递归模型 + 勾选父子联动 + indeterminate（antd/EP Tree）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `TreeNode[]` | 否 |  |
| `selectedKeys` | `string[]` | 否 | 受控选中 keys |
| `onSelect` | `(keys: string[]) => void` | 否 |  |
| `expandedKeys` | `string[]` | 否 | 受控展开 keys |
| `onExpand` | `(keys: string[]) => void` | 否 |  |
| `checkable` | `boolean` | 否 | 勾选模式（父子联动，antd 非 strict 语义） |
| `expandOnClick` | `boolean` | 否 | 点击有子节点的行 = 展开/折叠（不触发选中）——TreeSelect 场景（点行展开比点箭头直观） |
| `checkedKeys` | `string[]` | 否 |  |
| `onCheck` | `(keys: string[]) => void` | 否 |  |
| `searchValue` | `string` | 否 | 搜索过滤（label 含 searchValue 的节点 + 祖先；自动展开匹配路径 + 高亮） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Tree data={treeData} checkable
  checkedKeys={keys} onCheck={setKeys} />
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
| 源码 | `src/components/Tree/Tree.ts` |
| 样式 | `src/components/Tree/Tree.css` |
| 测试 | `src/components/Tree/Tree.test.ts` |
| demo | `apps/showcase/src/demos/DemoToggleTree.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/tree` ——（P1 填充具体步骤）
