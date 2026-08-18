# Notification · components

## 概述

队列式通知：notification.success/error/warning 命令式（antd 对齐）

## 典型场景

- 操作反馈/结果页/确认——保存成功、删除确认、空态/加载态

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `NotificationItem[]` | 否 |  |
| `onRemove` | `(id: string) => void` | 否 |  |
| `position` | `NotificationPosition` | 否 |  |
| `duration` | `number` | 否 | 全局默认自动关闭时间（ms），默认 4500 |
| `max` | `number` | 否 | 最大显示条数，超出移除最早，默认 0 = 不限制 |

## 用法示例

```tsx
notification.success({
  title: '部署成功',
  description: 'v0.63.0 已上线',
})
```

## 纪律/坑

> 退场动画（§8）：exit 类必须挂载（animationend 驱动）+ reduced-motion 降级

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Notification/Notification.ts` |
| 样式 | `src/client/components/Notification/Notification.css` |
| 测试 | `src/client/components/Notification/Notification.test.ts` |
| demo | `apps/showcase/src/demos/DemoNotification.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/notification` ——（P1 填充具体步骤）
