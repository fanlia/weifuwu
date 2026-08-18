# ContextMenu · components

## 概述

右键菜单：光标定位 + 方向键 + danger 变体（shadcn）

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `ContextMenuItem[]` | 否 |  |
| `children` | `any` | 是 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<ContextMenu items={[{key:'edit',label:'编辑'}]}>
  <div>右键区域</div>
</ContextMenu>
```

## 纪律/坑

- portal 槽豁免；右键 + 触屏长按双通道

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/ContextMenu/ContextMenu.ts` |
| 样式 | `src/client/components/ContextMenu/ContextMenu.css` |
| 测试 | `src/client/components/ContextMenu/ContextMenu.test.ts` |
| demo | `apps/showcase/src/demos/DemoContextMenu.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/contextmenu` ——（P1 填充具体步骤）
