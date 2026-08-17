# Dropdown · components

## 概述

下拉菜单，支持 danger variant

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `trigger` | `any` | 是 |  |
| `items` | `DropdownItem[]` | 否 |  |
| `open` | `boolean` | 否 |  |
| `onOpenChange` | `(open: boolean) => void` | 否 | 关闭回调（面板内 Escape / 外部点击） |

## 用法示例

```tsx
<Dropdown trigger={<Button>菜单</Button>}
  open={open}
  items={[
    {label:'编辑', onClick},
    {label:'删除', variant:'danger'},
  ]} />
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
| 源码 | `src/components/Dropdown/Dropdown.ts` |
| 样式 | `src/components/Dropdown/Dropdown.css` |
| 测试 | `src/components/Dropdown/Dropdown.test.ts` |
| demo | `apps/showcase/src/demos/DemoDropdown.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/dropdown` ——（P1 填充具体步骤）
