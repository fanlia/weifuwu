# NavMenu · components

## 概述

顶部导航：多级 hover 弹出 + 键盘（shadcn NavigationMenu）

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

> 待补写（AGENTS.md 事故记录按组件归类——高频组件优先）

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：[admin](../apps/admin.md)
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/components/NavMenu/NavMenu.ts` |
| 样式 | `src/components/NavMenu/NavMenu.css` |
| 测试 | `src/components/NavMenu/NavMenu.test.ts` |
| demo | `apps/showcase/src/demos/DemoNavMenu.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/navmenu` ——（P1 填充具体步骤）
