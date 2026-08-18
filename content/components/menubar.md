# Menubar · components

## 概述

水平菜单栏：←→ 切换 + ↓ 展开（shadcn Menubar）

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `menus` | `MenubarMenu[]` | 否 |  |

## 用法示例

```tsx
<Menubar menus={[{key:'file',label:'文件',items:[...]}]} />
```

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/Menubar/Menubar.ts` |
| 样式 | `src/client/components/Menubar/Menubar.css` |
| 测试 | `src/client/components/Menubar/Menubar.test.ts` |
| demo | `apps/showcase/src/demos/DemoMenubar.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/menubar` ——（P1 填充具体步骤）
