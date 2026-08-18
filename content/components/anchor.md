# Anchor · components

## 概述

锚点导航：滚动高亮跟随 + 点击平滑滚动

## 典型场景

- 页面模式：docs（复制即用蓝本——examples/patterns/）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `AnchorItem[]` | 是 |  |
| `activeKey` | `string` | 否 | 当前激活锚点（受控可选；省略时滚动自动跟随） |
| `onAnchorChange` | `(href: string) => void` | 否 | 激活锚点变化回调（受控或观察） |
| `useHash` | `boolean` | 否 | 点击是否更新 location.hash（默认 false——回调 + 滚动） |
| `container` | `() => HTMLElement \| Window` | 否 | 滚动容器（默认 window） |
| `offsetTop` | `number` | 否 | 高亮阈值：锚点进入视口该偏移内视为激活（px），默认 80 |
| `className` | `string` | 否 |  |

## 用法示例

```tsx
<Anchor items={[{ href: '#intro', title: '简介' }, ...]}
  activeKey={active} onAnchorChange={setActive} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：[docs](../patterns/docs.md)
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Anchor/Anchor.ts` |
| 样式 | `src/client/components/Anchor/Anchor.css` |
| 测试 | `src/client/components/Anchor/Anchor.test.ts` |
| demo | `apps/showcase/src/demos/DemoAnchor.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/anchor` ——（P1 填充具体步骤）
