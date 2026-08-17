# BackTop · components

## 概述

回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `visibilityHeight` | `number` | 否 | 滚动超过此高度显示（px），默认 400 |
| `target` | `() => HTMLElement \| Window` | 否 | 滚动容器（默认 window） |
| `smooth` | `boolean` | 否 | 平滑滚动，默认 true |
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

- ↑ 用于页面模式：[docs](../patterns/docs.md) · [landing](../patterns/landing.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/BackTop/BackTop.ts` |
| 样式 | `src/components/BackTop/BackTop.css` |
| 测试 | `src/components/BackTop/BackTop.test.ts` |
| demo | `apps/showcase/src/demos/DemoBackTop.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/backtop` ——（P1 填充具体步骤）
