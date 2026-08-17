# Alert · components

## 概述

信息提示条，4 种 variant + closable

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variant` | `AlertVariant` | 否 |  |
| `closable` | `boolean` | 否 |  |
| `onClose` | `() => void` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<Alert variant="info">提示</Alert>
<Alert variant="success">成功</Alert>
<Alert variant="warning">警告</Alert>
<Alert variant="error" closable>错误</Alert>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：[focus-task](../patterns/focus-task.md) · [settings-page](../patterns/settings-page.md)
- ↑ 用于应用：[auth](../apps/auth.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Alert/Alert.ts` |
| 样式 | `src/components/Alert/Alert.css` |
| 测试 | `src/components/Alert/Alert.test.ts` |
| demo | `apps/showcase/src/demos/DemoAlert.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/alert` ——（P1 填充具体步骤）
