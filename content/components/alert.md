# Alert · components

## 概述

信息提示条，4 种 variant + closable

## 典型场景

- 页面模式：focus-task、settings-page（复制即用蓝本——examples/patterns/）
- 应用模板：auth（examples/apps/ 完整可跑）
- 操作反馈/结果页/确认——保存成功、删除确认、空态/加载态

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

> 退场动画（§8）：exit 类必须挂载（animationend 驱动）+ reduced-motion 降级

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
