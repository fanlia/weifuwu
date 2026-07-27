# weifuwu — 架构约束与编码标准

全栈框架：后端 `(req, ctx) => Response` + 前端 `(props, ctx) => VNode` + 纯 CSS 布局。

## 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`
- **状态驱动渲染** — `ctx.ui.$` 深度 Proxy，赋值自动触发 VDOM patch
- **组件 = 纯函数** — `(props, ctx) => VNode`，无 class/hook/lifecycle
- **ref 管理生命周期** — `ref={el => { mount; return () => cleanup }}`，卸载时框架保证调用

## 核心标准速查

| ID | 规则 | 代码中的体现 |
|----|------|-------------|
| CS-01 | `throw`/`return` 后不留死代码 | if-else 都需 return |
| CS-02 | Promise 必须 await 或 catch | 无 `.then()` 无 catch |
| CS-03 | Event listener 内用 `console.error` 不用 `throw` | `server.on('error', ...)` |
| FS-01 | 组件 = `(props, ctx) => VNode` | 无 class/hook/this |
| FS-03 | Proxy 驱动渲染，不用 innerHTML | `$.x = val` 而非 DOM 操作 |
| FS-04 | 禁止 eval/new Function | 安全基线 |
| FS-05 | 前端无 npm 运行时依赖 | client 包 import 无外部 dep |
| PS-01 | 请求路径无同步 I/O | 无 readFileSync/execSync |
| RDR-01 | render 函数不写 `$` | `$` 写入只在事件回调/ref/`if (!ready)` 中 |

## $ 状态管理规则

```tsx
function Counter(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) $.count = 0 // 初始化

  return <button onClick={() => $.count++}>{$.count}</button>
}
```

- `$.x = val` → 自动排队重渲染
- `$.arr.push(val)` / `$.arr[0].x = y` → 自动 dirty（Proxy 深度拦截）
- `ctx.ui.dirty()` → 仅绕过 Proxy 直接操作底层对象时使用
- 每个组件实例独立 Proxy，同名变量不冲突

## 后端中间件模式

```ts
// 注入 ctx
import { createMiddleware } from 'weifuwu'
declare module 'weifuwu' { interface Context { myField: string } }

const myMw = createMiddleware({
  injects: ['myField'],
  depends: ['sql'],
  setup: async (ctx) => ({ myField: await ctx.sql`SELECT val` }),
})
app.use(myMw)
```

## 前端中间件模式

```ts
import { extendCtx } from 'weifuwu/client'

function myMw(ctx: WfuiContext): WfuiContext {
  return extendCtx(ctx, { myField: 'value' })
}
createApp().use(myMw)
```

## Control Flow

```tsx
// 条件
{cond ? <A/> : <B/>}
{cond && <A/>}

// 列表 - 必须有 key
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

## 测试

- `node --test` 无 Jest/Mocha
- 组件测试：调用 `MyComponent(props, mockCtx)` 断言 VNode
- $ 状态：`vnode._$.key = val`

## 构建 & 发布

- `node scripts/build.mjs`（esbuild）
- `node scripts/release.mjs <version>`（构建 + 发布 + git tag）
- `npm test` — 运行 `node --test`
- 测试前执行 `docker compose up -d`

## 路由匹配

- 后端 Router 使用 Trie 匹配，O(path_segments)
- 路径参数 `:id`，通配符 `*`
- `app.ws(path, handler)` WebSocket
- `app.graphql(handler)` GraphQL 端点
