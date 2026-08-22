# AppShell · components

## 概述

应用壳——品牌 + 分组导航 + 用户区 + 主内容（受控——父层驱动）

## 典型场景

- 页面导航——侧栏、页头、标签页、步骤、分页

## API

| prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nav` | `AppShellNavItem[]` | 否 | 导航菜单项（Menu items——key/label/icon/group） |
| `path` | `string` | 否 | 当前路由路径（activeKey 匹配——'/' 精确，其余前缀） |
| `onNavigate` | `(key: string) => void` | 否 | 导航回调（菜单选择 → 父层 navigate） |
| `onLogout` | `() => void` | 否 |  |
| `onSettings` | `() => void` | 否 |  |
| `loading` | `boolean` | 否 | 守卫加载态（骨架占位——不渲染菜单/用户） |
| `children` | `any` | 否 | 主内容区 |
| `footer` | `any` | 否 | 自定义底部（覆盖用户区——高级场景） |
| `sidebarWidth` | `string` | 否 | 侧栏宽度（layout 变量——默认 240px） |

## 用法示例

> （P1 迁移 CODE 字符串）

## 纪律/坑

> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调

## 关系

- ↑ 用于页面模式：（暂无）
- ↑ 用于应用：（暂无）
- → 后端能力：（暂无）

## 文件位置

| 文件 | 路径 |
|------|------|
| 源码 | `src/client/components/AppShell/AppShell.ts` |
| 样式 | `src/client/components/AppShell/AppShell.css` |
| 测试 | `src/client/components/AppShell/AppShell.test.ts` |
| demo | `apps/showcase/src/demos/DemoAppShell.tsx`（P1 拆分） |

## 验证

> agent-browser 走查：打开 `/components/navigation/appshell` ——（P1 填充具体步骤）
