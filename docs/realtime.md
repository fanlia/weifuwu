# 实时与渲染 — scheduler / ui / graphql / WebSocket（weifuwu）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## scheduler — 计划任务（即时/延时/cron）

> 依赖 `queue`（触发后入队执行）。三类任务：即时（queue.add 已有）、延时（`ctx.schedule`）、定时（`ctx.cron`）。

```ts
import { queue, scheduler } from 'weifuwu'

const q = queue()
app.use(q)
app.use(scheduler({ queue: q }))       // 依赖 ctx.queue（触发后入队）

// 延时任务（单次）：delayMs 或指定时间
await ctx.schedule('email.send', { to, body }, { delayMs: 30_000 })
await ctx.schedule('report.build', {}, { when: new Date('2026-09-01T00:00:00Z') })

// cron 定时任务（重复）：每分钟触发 → 入队执行
ctx.cron('* * * * *', 'heartbeat.check', { scope: 'health' })
// 改需求 = 重新注册（同 name 覆盖更新，旧定义不残留）
ctx.cron('*/5 * * * *', 'heartbeat.check', { scope: 'health' })
// 停用 = cancel（删定义 + 清理 pending 触发点）
await ctx.cancelCron('heartbeat.check')

// 执行端：与 queue 完全一致
const worker = ctx.queue.worker('email.send', async (job) => { ... })
```

- **延时**：ZSET（score=触发时间戳）+ 守护循环（独立连接）→ 到期 `ZREM` 原子抢占（多实例不重复）→ `queue.add`
- **多应用隔离**：`scheduler({ prefix })`——ZSET/HASH 应用级共享，多应用共用 redis 时必须各自 prefix（同应用多实例共享 prefix = 协作消费）
- **cron**：HASH 注册表（**field = name，同 name 重新注册 = 覆盖更新**，改表达式不残留旧定义）+ 滚动生成触发点（`ZADD NX` 幂等）→ 复用延时链路；`nextRunAt` 原子推进
- **取消**：`ctx.cancelCron(name)` 删定义 + 清理 pending 触发点（停用 cron 必须 cancel——定义无 TTL 会累积）
- **崩溃恢复**：未消费触发点留在 ZSET，重启后补扫立即触发（at-least-once，幂等由业务保证）
- **cron 表达式**：5 字段（分 时 日 月 周），支持 `*`/步进/列表/范围；时区 = 服务器本地；非法表达式注册即抛错
- **裁剪**：❌ cron 秒/年/别名（@daily）/特殊字符（L/W/#）、时区配置、单次任务取消（v2）、分布式锁（原子命令抢占替代）
- **文档红线**：cron 定义持久化在 HASH——进程重启后守护循环恢复即继续触发（无需重新注册）；**停用必须 `cancelCron`**（定义无 TTL，不取消会永久触发）

## ui — SSR 渲染 + JS/CSS 编译

```ts
import { ui } from 'weifuwu'

app.use(ui())
```

| ctx 注入 | 签名 | 说明 |
|----------|------|------|
| `ctx.ui.html` | `` (strings, ...values) => Response `` | HTML 模板 (转义防 XSS) |
| `ctx.ui.html.unsafe(str)` | `(string) => string` | 插入原始 HTML |
| `ctx.ui.js(entryPath)` | `(string) => Promise<Response>` | esbuild 编译 TSX → JS bundle |
| `ctx.ui.css(entryPath)` | `(string) => Promise<Response>` | 读取 CSS 文件 → CSS Response（如安装 postcss + @tailwindcss/postcss 则自动编译） |
| `ctx.ui.ssr(Comp, props?, { data })` | `(Component, props, opts?) => Promise<string>` | 服务端渲染组件 → HTML 片段（async 工厂自动 await；HtmlSafe 内联不二次转义） |
| `ctx.ui.ssrData(data)` | `(Map) => string` | 序列化 SSR 数据 → `<script>window.__DATA__=...</script>`（`<` 转义防 XSS） |

### ctx.ui.html — HTML 模板

模板插值自动转义（`& < > "` → 实体），防 XSS：

```ts
app.get('/page', (req, ctx) => ctx.ui.html`
  <h1>${title}</h1>          <!-- 自动转义 -->
  <div>${ctx.ui.html.unsafe(richHtml)}</div>  <!-- 不转义 -->
`)
```

### ctx.ui.js — 编译 TSX → JS

```ts
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/main.tsx'))   // 相对路径

app.get('/app.js', (req, ctx) => ctx.ui.js('weifuwu/ui-dom'))   // 或包名（exports map 解析）
```

使用 esbuild 编译：
- `bundle: true`, `format: 'esm'`, `platform: 'browser'`
- `jsx: 'automatic'`, `jsxImportSource: 'weifuwu/ui-dom'`
- 带 mtime 缓存验证（开发时编辑文件后自动失效）

### ctx.ui.css — CSS 编译

```ts
app.get('/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))               // 相对路径
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))   // 或包名
```

- 无编译工具时直接返回原始 CSS
- 检测到已安装 `postcss` + `@tailwindcss/postcss` 时自动编译 Tailwind CSS
- 支持包名（`weifuwu/layout/style.css`, `weifuwu/components/style.css`）或文件路径
- 带 mtime 缓存验证（开发时编辑文件后自动失效）

### ctx.ui.ssr — SSR 渲染组件 → HTML

将组件（含 async 组件）在服务端渲染为完整 HTML 片段，数据经 `ctx.data` 预取并序列化进 `window.__DATA__`（客户端 hydration 时同步命中，不重跑请求）：

```ts
const BlogPage = async (initProps, ctx) => {
  const post = await ctx.data.get(`/api/posts/${ctx.params.slug}`, fetchPost)
  return () =>
    h('article', {},
      h('h1', {}, post.title),
      h('div', { innerHTML: post.body }),
    )
}

app.get('/blog/:slug', async (req, ctx) => {
  const data = new Map()
  const html = await ctx.ui.ssr(BlogPage, {}, { data })   // HtmlSafe：模板内联不二次转义
  return ctx.ui.html`
    <!DOCTYPE html>
    <html><body>
      <div id="root">${html}</div>
      ${ctx.ui.ssrData(data)}
      <script src="/static/app.js"></script>
    </body></html>
  `
})
```

- 事件处理器/ref 剥离，文本自动转义（XSS），`class`/`style` 对象序列化，`innerHTML` 原样输出
- Fragment/Portal 子节点就地内联
- `ctx.ui.ssrData(data)` 输出 `<script>window.__DATA__=...</script>`（JSON `<` 转义防 XSS）
- 服务端 ctx shim：`$`（dirty no-op）、`ctx.data` 预取去重、`selfId` 请求级隔离

### Hydration — 客户端收养服务端 HTML

服务端 HTML + `window.__DATA__`（ctx.data 种子）到达客户端后，`mount(..., { hydrate: true })` **收养现有 DOM**（不重建、不闪跳），只接线事件/ref/$：

```ts
import { UIRouter, uiServe } from 'weifuwu/ui-dom'

const app = new UIRouter()
app.get('/blog/:slug', (loc, ctx) => h(BlogPage, { slug: ctx.params.slug }))
uiServe(app, { root: '#root', hydrate: true })   // 容器已有服务端 HTML → 收养
```

- **游标收养**：元素/文本按位置匹配现有 DOM；tag 不匹配 → 局部替换；文本不一致 → 就地修正；服务端多余节点 → 收尾清理
- **async 工厂 hydration**：工厂 `ctx.data.get` 从 `__DATA__` 同步命中（不重跑请求）→ 渲染与服务端一致 → 收养
- hydration 后 `$`/dirty/事件全量可用（与纯 SPA 无差别）
- 诚实裁剪：Portal 内容就地收养（不移动到 `#__wf_portal`）；渲染期非确定性（Date/random）会导致 mismatch（dev 警告）

### uiSsr — 路由级 SSR（声明即渲染）

共享路由定义，前后端同一份声明——后端匹配即自动 SSR，无需手写 handler/模板/序列化：

```tsx
// routes.tsx —— 前后端共用
import type { RouteDef } from 'weifuwu/ui-dom'
import { BlogPage } from './pages/BlogPage.tsx'

export const routes: RouteDef[] = [
  { path: '/blog/:slug', component: BlogPage, title: '博客' },
]

// server.ts —— 一行中间件：GET 匹配 → 注入 ctx.route.params → await 组件工厂 → 完整 HTML + __DATA__ + bundle
import { uiSsr } from 'weifuwu'
app.use(uiSsr({ routes, bundle: '/static/blog.js' }))

// blog-hydrate.ts —— 客户端：UIRouter 声明对应路由（匹配逻辑与 uiSsr 同源——route-match 纯函数共用）
import { UIRouter, uiServe, h } from 'weifuwu/ui-dom'

const client = new UIRouter()
client.get('/blog/:slug', (loc, ctx) => h(BlogPage, { slug: ctx.params.slug }))
uiServe(client, { root: '#root', hydrate: true })
```

- 组件工厂读 `ctx.params`（`/blog/:slug` → `ctx.params.slug`）——后端 uiSsr / 前端 UIRouter **同源注入**（`flattenRoutes/compilePath/matchRoute/extractParams` 纯函数共用）
- 未匹配 → next()（交给 API/静态/404）；非 GET → next()
- 可自定义 `title` / `template` / `styles`

### weifuwu/dev — 服务端直接跑 .tsx

Node 原生 TS 只剥离类型（不支持 JSX）。`weifuwu/dev` 注册 esbuild loader，服务端直接跑 `.tsx`（零构建）：

```json
{
  "scripts": {
    "dev": "node --import weifuwu/dev server.ts",
    "start": "node --import weifuwu/dev server.ts"
  }
}
```

- 前后端同一 JSX 运行时（`jsxImportSource: weifuwu/ui-dom`）→ 两端 VNode 一致 → hydration 可靠
- 与 `ctx.ui.js` 前端动态编译同一理念：无构建、无产物、改代码即生效

---

## graphql — GraphQL 端点

> **SDL + resolvers 绑定为自研实现**（`makeExecutableSchema`，56 行替代 @graphql-tools/schema）——支持根类型与嵌套类型字段 resolver、默认属性查找。

```ts
import type { GraphQLHandler } from 'weifuwu'

const handler: GraphQLHandler = async (req, ctx) => ({
  schema: `
    type Query {
      hello: String
      users: [User]
    }
    type User { id: ID, name: String }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
      users: () => [{ id: 1, name: 'Alice' }],
    },
  },
  rootValue: {},
  context: (req, ctx) => ({ user: ctx.user }),
  graphiql: true,
  maxDepth: 10,
  timeout: 30000,
})

// 挂载到 /
app.graphql(handler)

// 或挂载到自定义路径
app.graphql('/graphql', handler)
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `schema` | `string \| GraphQLSchema` | — | SDL 字符串或 Schema 对象 |
| `resolvers` | `any` | — | 解析器（schema 为字符串时必填）|
| `rootValue` | `any` | — | 根值 |
| `context` | `(req, ctx) => object` | — | 上下文工厂 |
| `graphiql` | `boolean` | — | 启用 GraphiQL IDE |
| `maxDepth` | `number` | `10` | 查询深度限制（0=关闭）|
| `timeout` | `number` | `30000` | 执行超时（ms，0=关闭）|

GET 请求支持 query 参数查询；POST 支持 JSON body。启用 `graphiql: true` 时，GET 无 `?query=` 参数返回 GraphiQL IDE 页面。

---

## WebSocket

```ts
app.ws('/chat/:room', {
  open(ws, ctx) {
    ws.send(`欢迎加入 ${ctx.params.room} 房间`)
    ctx.hub?.join(ctx.params.room, ws)
  },
  message(ws, ctx, data) {
    // data: string | Buffer
    ctx.hub?.send(ctx.params.room, `用户: ${data}`)
  },
  close(ws, ctx) {
    ctx.hub?.leave(ws)
  },
  error(ws, ctx, error) {
    console.error('WS error:', error)
  },
})
```

| 回调 | 参数 | 说明 |
|------|------|------|
| `open(ws, ctx)` | `WebSocket`, `Context` | 连接建立 |
| `message(ws, ctx, data)` | `WebSocket`, `Context`, `string \| Buffer` | 收到消息 |
| `close(ws, ctx)` | `WebSocket`, `Context` | 连接关闭 |
| `error(ws, ctx, error)` | `WebSocket`, `Context`, `Error` | 错误 |

### Hub — WebSocket 房间

```ts
// 注入 hub → ctx.hub
app.ws('/chat/:room', {
  open(ws, ctx)  { ctx.hub.join(ctx.params.room, ws) },
  message(ws, ctx, data) { ctx.hub.send(ctx.params.room, String(data)) },
  close(ws, ctx) { ctx.hub.leave(ws) },
})

// 自定义 Hub（Redis 后端）
import type { Hub } from 'weifuwu'
const redisHub: Hub = { ... }
app.wsHub(redisHub)
```

| Hub 方法 | 说明 |
|----------|------|
| `join(key, ws)` | WebSocket 加入房间 |
| `leave(ws)` | WebSocket 离开所有房间 |
| `send(key, message)` | 向房间广播消息 |
| `close()` | 关闭 Hub |

WebSocket 原生 `ws.send()` 发送，`ws.on('message', cb)` WebSocket 接收。

> **实时应用推荐用 `messager()`**（SaaS 地基模块）：协议内置（`connected/subscribe/ping`）+ 持久化 + 跨进程广播 + 点对点，不必自写 Hub/协议——见[消息系统章节](saas.md)。

---

