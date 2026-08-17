# Watermark · components

## 概述

水印：canvas 平铺绘制 + overlay（antd Watermark）

## 典型场景

- 数据展示——列表页、详情页、信息呈现

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 否 | 水印文字 |
| `fontSize` | `number` | 否 |  |
| `color` | `string` | 否 | 文字颜色（默认继承） |
| `opacity` | `number` | 否 | 透明度 0-1，默认 0.15 |
| `rotate` | `number` | 否 | 旋转角度（度），默认 -25 |
| `gap` | `number` | 否 | 平铺间距（px），默认 100 |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Watermark text="内部资料">
  <div>内容</div>
</Watermark>
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
| 源码 | `src/components/Watermark/Watermark.ts` |
| 样式 | `src/components/Watermark/Watermark.css` |
| 测试 | `src/components/Watermark/Watermark.test.ts` |
| demo | `apps/showcase/src/demos/DemoWatermark.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/watermark` ——（P1 填充具体步骤）
