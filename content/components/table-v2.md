# Table 行选择 · components

## 概述

rowSelection 勾选列 + 受控 keys（状态矩阵覆盖）

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<Table rowSelection={{selectedRowKeys, onChange:setKeys}}
  data={rows} columns={[{key:'name',label:'姓名'}]} />
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
| demo | `apps/showcase/src/demos/DemoTableRowSelect.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/table-v2` ——（P1 填充具体步骤）
