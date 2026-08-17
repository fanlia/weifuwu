# Popconfirm · components

## 概述

气泡确认：危险操作防误触 + 复用 usePopup 基座

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `any` | 否 |  |
| `okText` | `string` | 否 |  |
| `cancelText` | `string` | 否 |  |
| `okType` | `'primary' \| 'danger'` | 否 |  |
| `danger` | `boolean` | 否 | 危险确认（默认图标换 warning 色 + 确认按钮 danger） |
| `onConfirm` | `() => void` | 否 |  |
| `onCancel` | `() => void` | 否 |  |
| `position` | `Placement` | 否 |  |
| `open` | `boolean` | 否 |  |
| `onOpenChange` | `(open: boolean) => void` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `icon` | `any` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Popconfirm title="确定删除？" danger onConfirm={del}>
  <Button variant="danger">删除</Button>
</Popconfirm>
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
| 源码 | `src/components/Popconfirm/Popconfirm.ts` |
| 样式 | `src/components/Popconfirm/Popconfirm.css` |
| 测试 | `src/components/Popconfirm/Popconfirm.test.ts` |
| demo | `apps/showcase/src/demos/DemoPopconfirm.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/popconfirm` ——（P1 填充具体步骤）
