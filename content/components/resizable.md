# Resizable · components

## 概述

拖拽分割面板：pointer + 键盘方向键 + clamp（shadcn）

## 典型场景

- 大数据列表/表格/树——千级+数据量的性能场景

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `direction` | `'horizontal' \| 'vertical'` | 否 | horizontal 左右分割（默认）/ vertical 上下分割 |
| `defaultSize` | `number` | 否 | 第一面板初始尺寸（px） |
| `min` | `number` | 否 | 最小尺寸（px），默认 80 |
| `max` | `number` | 否 | 最大尺寸（px），默认 80% 视口 |
| `step` | `number` | 否 | 键盘步进（px），默认 20 |
| `children` | `[any, any]` | 是 |  |
| `onResize` | `(size: number) => void` | 否 |  |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Resizable defaultSize={180}>
  {[<PaneA />, <PaneB />]}
</Resizable>
```

## 纪律/坑

> 大数据渲染：固定行高 + 窗口化（VirtualList）——动态高度裁剪登记

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/Resizable/Resizable.ts` |
| 样式 | `src/components/Resizable/Resizable.css` |
| 测试 | `src/components/Resizable/Resizable.test.ts` |
| demo | `apps/showcase/src/demos/DemoResizable.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/virtual/resizable` ——（P1 填充具体步骤）
