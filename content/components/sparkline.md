# Sparkline · components

## 概述

迷你趋势线：SVG 自绘 + 归一化 + 平滑曲线 + 面积填充

## 典型场景

- 页面模式：data-screen（复制即用蓝本——examples/patterns/）
- 数据看板/统计报表——指标卡、图表、趋势

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `number[]` | 是 | 数据序列 |
| `width` | `number` | 否 | SVG 宽（默认 120） |
| `height` | `number` | 否 | SVG 高（默认 32） |
| `stroke` | `string` | 否 | 描边色（默认语义 primary，随 currentColor 可继承） |
| `fill` | `boolean` | 否 | 面积填充（默认关） |
| `smooth` | `boolean` | 否 | 平滑曲线（Catmull-Rom）——默认折线 |
| `label` | `string` | 否 | 可访问名（提供则 role=img + aria-label，否则 aria-hidden 装饰） |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Sparkline data={[12, 18, 15, 22, 30, 28, 35]} width={140} height={36} fill />
```

## 纪律/坑

> 图表自研 SVG：数据点 label 为轴名；交互 tooltip 经 usePopup（视口夹紧）

## 关系

- ↑ 用于页面模式：[data-screen](../patterns/data-screen.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Sparkline/Sparkline.ts` |
| 样式 | `src/components/Sparkline/Sparkline.css` |
| 测试 | `src/components/Sparkline/Sparkline.test.ts` |
| demo | `apps/showcase/src/demos/DemoSparkline.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/viz/sparkline` ——（P1 填充具体步骤）
