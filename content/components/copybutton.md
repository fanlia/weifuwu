# CopyButton · components

## 概述

复制按钮：clipboard + execCommand 降级 + 成功状态机

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 | 要复制的文本 |
| `label` | `string` | 否 | 按钮文字（默认仅图标） |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `variant` | `'ghost' \| 'secondary' \| 'default'` | 否 |  |
| `iconOnly` | `boolean` | 否 | 仅图标（无文字） |
| `successText` | `string` | 否 | 成功提示文字（默认「已复制」） |
| `onCopied` | `() => void` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<CopyButton value="https://..." label="复制" />
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
| 源码 | `src/components/CopyButton/CopyButton.ts` |
| 样式 | `src/components/CopyButton/CopyButton.css` |
| 测试 | `src/components/CopyButton/CopyButton.test.ts` |
| demo | `apps/showcase/src/demos/DemoCopyButton.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/core/copybutton` ——（P1 填充具体步骤）
