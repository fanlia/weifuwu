# apps/agent-builder — weifuwu 最简应用（Agent 构建器起点）

纯框架消费形态（零自定义组件/中间件）：

```
server.ts   后端：serve + Router + ui（ctx.ui.js 编译 main.tsx / html / css）
main.tsx    前端：UIRouter + uiServe + weifuwu/components + wf-* 原语
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
