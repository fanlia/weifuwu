# Popover · components

## 概述

通用弹出层，click/hover 触发，4 方向

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `any` | 否 |  |
| `trigger` | `'click' \| 'hover'` | 否 |  |
| `position` | `PopoverPosition` | 否 |  |
| `open` | `boolean` | 否 |  |
| `onOpenChange` | `(open: boolean) => void` | 否 |  |
| `disabled` | `boolean` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Popover content={<div>面板内容</div>}>
  <Button>点击弹出</Button>
</Popover>

<Popover position="top" content=...>
  <Button>顶部</Button>
</Popover>

<Popover trigger="hover" content=...>
  <span>悬停查看</span>
</Popover>
```

## 纪律/坑

- portal 槽豁免（同 HoverCard）
- 富内容自动判定已裁剪——HoverCard 补富内容（components-cuts.md）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Popover/Popover.ts` |
| 样式 | `src/components/Popover/Popover.css` |
| 测试 | `src/components/Popover/Popover.test.ts` |
| demo | `apps/showcase/src/demos/DemoPopover.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/popover` ——（P1 填充具体步骤）
