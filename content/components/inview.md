# InView · components

## 概述

进入视窗后懒加载内容，支持 IntersectionObserver

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `once` | `boolean` | 否 |  |
| `threshold` | `number` | 否 |  |
| `rootMargin` | `string` | 否 |  |
| `placeholder` | `any` | 否 |  |
| `onEnter` | `() => void` | 否 |  |
| `children` | `any` | 否 |  |

## 用法示例

```tsx
<InView>
  <ExpensiveComponent />
</InView>

<InView once={false} rootMargin="200px"
  onEnter={() => console.log('进入')}>
  <img src="large.jpg" />
</InView>
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
| 源码 | `src/components/InView/InView.ts` |
| 样式 | `src/components/InView/InView.css` |
| 测试 | `src/components/InView/InView.test.ts` |
| demo | `apps/showcase/src/demos/DemoInView.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/display/inview` ——（P1 填充具体步骤）
