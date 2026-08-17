# Menubar · components

## 概述

水平菜单栏：←→ 切换 + ↓ 展开（shadcn Menubar）

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `menus` | `MenubarMenu[]` | 否 |  |

## 用法示例

```tsx
<Menubar menus={[{key:'file',label:'文件',items:[...]}]} />
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
| 源码 | `src/components/Menubar/Menubar.ts` |
| 样式 | `src/components/Menubar/Menubar.css` |
| 测试 | `src/components/Menubar/Menubar.test.ts` |
| demo | `apps/showcase/src/demos/DemoMenubar.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/menubar` ——（P1 填充具体步骤）
