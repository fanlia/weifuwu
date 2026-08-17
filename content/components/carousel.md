# Carousel · components

## 概述

轮播：箭头/圆点/循环 + 自动播放（三库共识）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `children` | `any[]` | 是 |  |
| `autoplay` | `boolean` | 否 | 自动播放 |
| `interval` | `number` | 否 | 自动播放间隔（ms），默认 3000 |
| `showArrows` | `boolean` | 否 |  |
| `showDots` | `boolean` | 否 |  |
| `loop` | `boolean` | 否 | 循环播放（尾 → 头），默认 true |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Carousel autoplay interval={3000}>
  {slides.map(s => <div>{s}</div>)}
</Carousel>
```

## 纪律/坑

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Carousel/Carousel.ts` |
| 样式 | `src/components/Carousel/Carousel.css` |
| 测试 | `src/components/Carousel/Carousel.test.ts` |
| demo | `apps/showcase/src/demos/DemoCarousel.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/carousel` ——（P1 填充具体步骤）
