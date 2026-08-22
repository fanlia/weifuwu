# apps/agent-builder — Agent 世界模拟平台

> 蓝图：design/agent-builder-plan.md——本质模型/架构/商业模式/落地路线

纯框架消费（零自定义组件/中间件——weifuwu 全能力验证）：

```
server.ts          后端：serve + Router + postgres + ui
src/routes/worlds.ts  世界 API（worlds/agents/relations/events CRUD——Phase 1）
ui/main.tsx        前端：UIRouter + uiServe + api 中间件
ui/pages/          世界列表/新建/详情（角色/关系/图谱/事件管理——Phase 1）
```

## 运行

```bash
cd apps/agent-builder
node server.ts        # → http://localhost:3400
```

## 消费面

| 面 | 使用 |
|---|---|
| 后端 | `weifuwu`（serve/Router/ui） |
| 引擎 | `weifuwu/vdom`（UIRouter/uiServe/h） |
| 组件 | `weifuwu/components`（Card/Button/Icon/Avatar/Tag） |
| 布局 | wf-* 原语（container/stack/row/gap） |

页面交互：计数器（ctx.render）+ SPA 导航（a[href] 链接拦截）。
