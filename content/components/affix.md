# Affix · components

## 概述

回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `offsetTop` | `number` | 否 | 距视口顶部偏移，滚动超过该值后固定（px），默认 0 |
| `target` | `() => HTMLElement \| Window` | 否 | 滚动容器（默认 window） |
| `children` | `any` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<BackTop visibilityHeight={400} />

<Affix offsetTop={80}>
  <nav>固定导航条</nav>
</Affix>
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
| 源码 | `src/components/Affix/Affix.ts` |
| 样式 | `src/components/Affix/Affix.css` |
| 测试 | `src/components/Affix/Affix.test.ts` |
| demo | `apps/showcase/src/demos/DemoAffix.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/affix` ——（P1 填充具体步骤）
