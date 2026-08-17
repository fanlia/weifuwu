# Confirm · components

## 概述

确认对话框，Promise 化 await 调用

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `open` | `boolean` | 否 |  |
| `title` | `string` | 否 |  |
| `message` | `any` | 否 | 提示内容（文本或任意 VNode） |
| `confirmText` | `string` | 否 |  |
| `cancelText` | `string` | 否 |  |
| `variant` | `'primary' \| 'danger'` | 否 |  |
| `width` | `string` | 否 | 对话框宽度，如 '500px'、'80%'，默认 Modal 的 400px |
| `maskClosable` | `boolean` | 否 | 遮罩点击是否取消（默认 false：危险操作防误触；显式传 true 可恢复） |
| `onConfirm` | `() => void` | 否 |  |
| `onCancel` | `() => void` | 否 |  |
| `onClose` | `() => void` | 否 | Modal 关闭回调（Escape/遮罩——onCancel 缺省时兜底——命令式兼容） |

## 用法示例

```tsx
const ok = await ctx.confirm?.('确定删除？', {
  confirmText: '删除',
  variant: 'danger',
})
if (ok) { /* 执行 */ }
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
| 源码 | `src/components/Confirm/Confirm.ts` |
| 测试 | `src/components/Confirm/Confirm.test.ts` |
| demo | `apps/showcase/src/demos/DemoConfirm.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/confirm` ——（P1 填充具体步骤）
