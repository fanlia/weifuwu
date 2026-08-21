# Tour · components

## 概述

新手引导：步骤气泡 + 目标高亮 + 遮罩 + 键盘 Escape

## 典型场景

- 浮层交互——弹窗、下拉、气泡、抽屉、命令面板

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `steps` | `TourStep[]` | 是 |  |
| `open` | `boolean` | 否 | 受控：是否打开 |
| `onChange` | `(open: boolean) => void` | 否 | 受控回调（关闭时 onChange(false)） |
| `current` | `number` | 否 | 受控：当前步骤索引 |
| `onStepChange` | `(step: number) => void` | 否 | 步骤变化回调 |
| `onFinish` | `() => void` | 否 | 完成/跳过回调 |
| `mask` | `boolean` | 否 | 遮罩（默认 true） |

## 用法示例

```tsx
<Tour steps={[{ target: '#a', title: '开始', content: '...' }]} open={open} onChange={setOpen} />
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
| 源码 | `src/client/components/Tour/Tour.ts` |
| 样式 | `src/client/components/Tour/Tour.css` |
| 测试 | `src/client/components/Tour/Tour.test.ts` |
| demo | `apps/showcase/src/demos/DemoTour.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/overlay/tour` ——（P1 填充具体步骤）
