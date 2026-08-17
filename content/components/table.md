# Table · components

## 概述

可排序 + 自定义 render + 空状态

## 典型场景

- 页面模式：app-shell、dashboard、list-page（复制即用蓝本——examples/patterns/）
- 应用模板：admin、agent-platform（examples/apps/ 完整可跑）
- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `any[]` | 否 |  |
| `columns` | `TableColumn[]` | 是 |  |
| `onRowClick` | `(row: any, index: number) => void` | 否 |  |
| `sortKey` | `string` | 否 | 当前排序列的 key |
| `sortOrder` | `'asc' \| 'desc'` | 否 | 当前排序方向 |
| `onSort` | `(key: string, order: 'asc' \| 'desc') => void` | 否 | 排序变化回调 |
| `rowSelection` | `TableRowSelection` | 否 | 行选择（受控） |
| `emptyText` | `string` | 否 | 数据为空时显示的文本 |
| `minWidth` | `string` | 否 | 表格最小宽度（窄屏横向滚动，如 '720px'） |
| `onCellEdit` | `(key: string, rowIndex: number, value: string, row: any) => void` | 否 | 行内编辑提交回调（editable 列必配——受控纪律） |
| `loading` | `boolean` | 否 | 加载中：保留表头，渲染骨架行 |
| `loadingRows` | `number` | 否 | 骨架行数，默认 3 |

## 用法示例

```tsx
<Table data={items} columns={[
  {key:'id', label:'ID'},
  {key:'name', label:'姓名', sortable: true},
  {key:'status', label:'状态',
    render: v => <Badge>{v}</Badge>},
]}
  sortKey="name" sortOrder="asc"
  onSort={(k,o) => setSort(k,o)} />
```

## 纪律/坑

- 固定列必须显式 width（缺省 140 估算 + console.warn——sticky 偏移累计依赖）
- 数组空洞：children 里 {cond && <X/>} 是占位——不得误删下一个兄弟（提交按钮消失事故同源）
- 行内编辑（editable 列）必须配 onCellEdit（受控纪律）

## 关系

- ↑ 用于页面模式：[app-shell](../patterns/app-shell.md) · [dashboard](../patterns/dashboard.md) · [list-page](../patterns/list-page.md)
- ↑ 用于应用：[admin](../apps/admin.md) · [agent-platform](../apps/agent-platform.md)
- → 后端能力：[sql](../backend/sql.md) · [redis](../backend/redis.md)

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Table/Table.ts` |
| 样式 | `src/components/Table/Table.css` |
| 测试 | `src/components/Table/Table.test.ts` |
| demo | `apps/showcase/src/demos/DemoTable.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/table` ——（P1 填充具体步骤）
