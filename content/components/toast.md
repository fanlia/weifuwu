# Toast · components

## 概述

5 种位置 + 自动消失 + 数量限制

## 典型场景

- 操作反馈/结果页/确认——保存成功、删除确认、空态/加载态

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `toasts` | `ToastItem[]` | 否 |  |
| `onRemove` | `(id: string) => void` | 否 |  |
| `position` | `ToastPosition` | 否 | 容器位置，默认 top-right |
| `duration` | `number` | 否 | 全局默认自动消失时间（ms），0 = 不自动消失，默认 0 |
| `max` | `number` | 否 | 最大显示条数，超出时移除最早条目，默认 0 = 不限制 |

## 用法示例

```tsx
// toasts: [{id, type, message}]
<Toast toasts={toasts}
  position="top-right"
  max={3}
  onRemove={id => ...} />
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
| 源码 | `src/components/Toast/Toast.ts` |
| 样式 | `src/components/Toast/Toast.css` |
| 测试 | `src/components/Toast/Toast.test.ts` |
| demo | `apps/showcase/src/demos/DemoToast.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/feedback/toast` ——（P1 填充具体步骤）
