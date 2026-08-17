# StatCard Countdown · components

## 概述

倒计时模式：剩余 HH:MM:SS + 结束回调

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

> props 提取降级（接口格式特殊）——见源码：`—`

## 用法示例

```tsx
<StatCard label="倒计时" countdown={deadline} />
```

## 纪律/坑

> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| demo | `apps/showcase/src/demos/DemoStatCountdown.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/statcard-countdown` ——（P1 填充具体步骤）
