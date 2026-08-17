# Rate · components

## 概述

评分：键盘方向键 / allowClear / readOnly，新增 star 图标

## 典型场景

- 表单输入/搜索/筛选——查询区、编辑表单、设置页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number` | 否 | 当前评分值（0..count） |
| `onChange` | `(value: number) => void` | 否 |  |
| `count` | `number` | 否 | 星星总数，默认 5 |
| `size` | `'sm' \| 'md' \| 'lg'` | 否 |  |
| `readOnly` | `boolean` | 否 | 只读（展示态，不可交互、不可聚焦） |
| `disabled` | `boolean` | 否 |  |
| `allowClear` | `boolean` | 否 | 点击当前评分值 → 清除为 0（antd 对齐） |
| `allowHalf` | `boolean` | 否 | 允许半星（0.5 精度；点击左半=半星，右半=整星） |

## 用法示例

```tsx
<Rate value={3} onChange={setRate} />
<Rate value={4} readOnly />
<Rate size="lg" allowClear />
```

## 纪律/坑

- 小尺寸 button 固定 min/max-height（§5.6）：星 16x36 竖条事故

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Rate/Rate.ts` |
| 样式 | `src/components/Rate/Rate.css` |
| 测试 | `src/components/Rate/Rate.test.ts` |
| demo | `apps/showcase/src/demos/DemoRate.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/input/rate` ——（P1 填充具体步骤）
