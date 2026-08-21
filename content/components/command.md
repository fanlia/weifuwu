# Command · components

## 概述

命令面板：⌘K 全局快捷键 + 键盘流（shadcn Command）

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `open` | `boolean` | 否 |  |
| `onOpenChange` | `(open: boolean) => void` | 否 |  |
| `items` | `CommandItem[]` | 否 |  |
| `placeholder` | `string` | 否 |  |
| `emptyText` | `string` | 否 |  |
| `globalShortcut` | `string \| null` | 否 | 全局快捷键，如 'mod+k'（cmd/ctrl + k）；null 关闭全局监听 |

## 用法示例

```tsx
<Command items={items} open={open}
  onOpenChange={setOpen} />
```

## 纪律/坑

> 弹窗纪律（§5.4）：浮层必须 openPopup 命令式（#__wf_portal 统一容器）——禁 absolute 相对父容器（overflow/transform 裁剪）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Command/Command.ts` |
| 样式 | `src/client/components/Command/Command.css` |
| 测试 | `src/client/components/Command/Command.test.ts` |
| demo | `apps/showcase/src/demos/DemoCommand.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/command` ——（P1 填充具体步骤）
