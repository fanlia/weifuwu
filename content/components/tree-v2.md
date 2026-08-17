# Tree 勾选 · components

## 概述

checkable 父子联动 + 受控 checkedKeys（变体覆盖）

## 典型场景

- 复杂数据交互——穿梭、树、级联、看板、流水线

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Tree data={treeData} checkable checkedKeys={checked} onCheck={setChecked} />
```

## 纪律/坑

> （该分类暂无通用纪律——组件级事故见源码注释）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoToggleTreeCheck.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/advanced/tree-v2` ——（P1 填充具体步骤）
