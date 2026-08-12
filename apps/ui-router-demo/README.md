# apps/ui-router-demo — ui-dom 浏览器冒烟面

共享 UIRouter 的可视化验证（D3）：路由匹配 / SSR / hydration / VDOM 组件复用在一个 demo 里冒烟。
**server（ssrPage）与 client（uiServe）复用同一 `src/router.ts` 路由定义**——两端匹配/参数注入同源。

## 启动

```bash
cd apps/ui-router-demo
node server.ts        # → http://localhost:3100
```

## 能力清单（冒烟覆盖矩阵）

| 页面 | 路径 | 验证点 |
|------|------|--------|
| 首页 | `/` | SSR 输出 + hydration 收养 · data 管道（`ctx.data.get` → `__DATA__` 种子）· query · 组件复用（Button/Input/Tag/Icon/toast）· 计数器（组件内部状态）· **精准刷新**（StatsPanel：selfId + 定时器 `render(['stats'])`——tick 每 2s 更新，页面其他部分不重渲染）· **命令式 API**（toast / confirm / notification 全流程） |
| 列表 | `/todos` | keyed 列表轮转（显式 key——DOM id 跟随项身份复用） |
| Store | `/store` | **createStore + useExternal**——两面板订阅同一 store，任一按钮更新双方同步（导航往返状态保持） |
| Hooks | `/hooks` | **useScrollPosition**（滚动位置实时）· **useBreakpoint**（断点标签）· **useInView 懒加载**（卡片滚入视口才渲染，once-latch） |
| 异步 | `/async` | async 组件工厂（数据自动进 `__DATA__`） |
| 用户 | `/users/:id` | 路由参数 `ctx.params.id` |
| 后台 | `/admin/api/users/7` | 嵌套路由子树（独立中间件链 + 两层嵌套 + 子 404） |
| 错误 | `/error` | handler 抛错 → `.ui-dom-error` 错误页（不黑屏） |
| 404 | `/nope` | `notFound` 兜底 |

全局：Layout 中间件（两阶段——外层 mount 拿 children）+ ThemeSwitch（亮/暗）+ `nav` helper（pushState + popstate——uiServe 监听 popstate 执行路由）。

## 验证记录（agent-browser 实测，2026-12）

| 场景 | 结果 |
|------|------|
| SSR 输出完整 HTML + `__DATA__` | ✓ |
| hydration 后交互（点击计数 0→1） | ✓ |
| keyed 轮转（a,b,c → b,c,a——DOM id 跟随 key） | ✓ |
| Store 跨组件同步（面板 a +1 → b 同步 1） | ✓ |
| 精准刷新（stats-tick 2s 更新） | ✓ |
| Hooks（scrollY 实时 / breakpoint: desktop / 懒加载滚入渲染 8/8） | ✓ |
| confirm 弹窗（portal .wf-modal + 确定 → notification「已确认」） | ✓ |
| ThemeSwitch（暗色 body rgb(15,23,42)） | ✓ |
| 错误页（handler 抛错 → .ui-dom-error，不黑屏） | ✓ |
| 嵌套后台 + API 用户 + 404 | ✓ |

## 引擎 bug 记录（2026-12 走查暴露）

- **useMedia/useBreakpoint 全链路失效**：`createPopupTrackerSystem` 返回值无 `mediaRegistry`，
  mount.ts 用 `as any` 解构掩盖为 undefined——useBreakpoint 报 `Cannot read properties of undefined (reading 'has')`。
  修复：mount.ts 自建 `mediaRegistry` Map（组件库测试未覆盖此路径——无组件调用 useBreakpoint 实测暴露）。
  回归：1796 全绿 + hooks 相关 16 测试绿。
