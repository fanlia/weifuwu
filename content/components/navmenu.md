# NavMenu · components

## 概述

顶部导航：多级 hover 弹出 + 键盘（shadcn NavigationMenu）

## 典型场景

- 应用模板：admin（examples/apps/ 完整可跑）
- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `NavMenuItem[]` | 是 |  |
| `activeKey` | `string` | 否 |  |
| `onSelect` | `(key: string) => void` | 否 |  |

## 用法示例

```tsx
<NavMenu items={items} activeKey="home" onSelect={go} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/NavMenu/NavMenu.ts` |
| 样式 | `src/client/components/NavMenu/NavMenu.css` |
| 测试 | `src/client/components/NavMenu/NavMenu.test.ts` |
| demo | `apps/showcase/src/demos/DemoNavMenu.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/navmenu` ——（P1 填充具体步骤）
