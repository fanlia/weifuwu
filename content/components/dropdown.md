# Dropdown · components

## 概述

下拉菜单，支持 danger variant

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

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

- 受控纪律：受控 open 必须配 onOpenChange——缺回调静默不可点
- portal 槽豁免：浮层插槽 [children, popup.portal()] 打开/关闭不触发 A 级动态数组检测

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
