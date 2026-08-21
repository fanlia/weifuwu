# Chart · components

## 概述

SVG 图表：line/bar/pie/radar/gauge/scatter——零依赖自绘

## 典型场景

- 应用模板：admin（examples/apps/ 完整可跑）
- 数据看板/统计报表——指标卡、图表、趋势

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `ChartType` | 否 |  |
| `data` | `DataPoint[]` | 是 |  |
| `options` | `ChartOptions` | 否 |  |
| `title` | `string` | 否 |  |
| `area` | `boolean` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Chart type="line" data={data} title="标题" />
<Chart type="bar" data={data} />
<Chart type="pie" data={data} />

```

## 纪律/坑

> 图表自研 SVG：数据点 label 为轴名；交互 tooltip 经 openPopup（视口夹紧）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Chart/Chart.ts` |
| 样式 | `src/client/components/Chart/Chart.css` |
| 测试 | `src/client/components/Chart/Chart.test.ts` |
| demo | `apps/showcase/src/demos/DemoChart.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/viz/chart` ——（P1 填充具体步骤）
