# Command · components

## 概述

命令面板：⌘K 全局快捷键 + 键盘流（shadcn Command）

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Command/Command.ts` |
| 样式 | `src/components/Command/Command.css` |
| 测试 | `src/components/Command/Command.test.ts` |
| demo | `apps/showcase/src/demos/DemoCommand.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/command` ——（P1 填充具体步骤）
