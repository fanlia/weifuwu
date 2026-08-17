# 管理后台 · apps

## 概述

AppShell + Dashboard/Table/Form 多页——layout 包裹复用 + 主题。后端：rateLimit + 查询端点。源于 agent-platform 架构提炼。


## 用到的页面模式
- [app-shell](../patterns/app-shell.md)

## 用到的组件
- [Layout](../components/layout.md)
- [Menu](../components/menu.md)
- [NavMenu](../components/navmenu.md)
- [Table](../components/table.md)
- [Form](../components/form.md)
- [ThemeSwitch](../components/themeswitch.md)
- [StatCard](../components/statcard.md)
- [Chart](../components/chart.md)
- [Badge](../components/badge.md)
- [Avatar](../components/avatar.md)
- [Tag](../components/tag.md)

## 源码

> `examples/apps/admin/` ——完整可运行（随 npm 包发布）

## 目录结构

| 文件 | 职责 |
|------|------|
| `app.tsx` | 前端：AppShell（Layout 骨架 + Menu）+ DashboardPage/OrdersPage + 路由 layout 包裹 |
| `api.ts` | 后端：registerAdminApi——订单查询 + 种子数据 |
| `server.ts` | 独立入口（:3302） |
| `main.tsx` | 独立前端入口 |

## 改造指南（新手从跑起来到改成自己的）

- 1. 换业务数据：api.ts 的 admin_orders 表 + 种子数据 → 自己的业务表（或接真实 postgres）
- 2. 加页面：app.tsx 路由表加 { path, render, layout: AppShell }——侧栏 Menu items 同步加
- 3. 改菜单/品牌：AppShell 里 Menu items + 标题文案
- 4. 表格交互：Table 组件文档（sortable/rowSelection——受控 props 配回调）
- 5. 参考生产级：apps/agent-platform/（多租户/权限/商业化真实架构）

## 质量标准

- [x] 键盘可达
- [x] 侧栏折叠
- [x] 表格排序
- [x] 亮暗主题
- [x] loading/empty 态

## 验证

> agent-browser 走查：打开 showcase `/apps/admin`（活体嵌入）——列表/新建/保存/删除全流程 + 控制台零错误
