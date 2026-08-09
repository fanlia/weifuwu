# ui-dom — 前端路由（UIRouter + VDOM，试验性独立实现）

> **试验性**：`src/ui-dom/` 是定稿架构（`design/ui-architecture.md`）的独立实现，
> **零依赖 `weifuwu/client`**（不共享渲染运行时状态）。成熟后替换 createApp/router。
> 当前未随 npm 包发布（无 `weifuwu/ui-dom` 导出路径），源码直用。
>
> 概念对齐：**req = window.location**（浏览器原生 Location），**res = VNode**（数据结构），
> **serveUI = VDOM**（落地机制），**params/query 在 ctx**（对齐后端 `ctx.params`/`ctx.query`）。

## 快速开始

```tsx
import { UIRouter, serveUI, h } from './src/ui-dom/index.ts'

const app = new UIRouter()

// handler = 异步组件：async (location, ctx) => VNode（$ 有效）
app.get('/', async (location, ctx) => {
  const data = await ctx.ui.data.get('/api/info', async () => ({ title: '首页' }))
  const $ = ctx.ui.$()
  $.clicks = $.clicks ?? 0
  return h('div', {},
    h('h2', {}, data.title),
    h('button', { onClick: () => $.clicks++ }, `点击 ${$.clicks} 次`),
  )
})

app.get('/users/:id', (location, ctx) =>
  h('div', {}, `用户 ${ctx.params.id}`))   // ctx.params 注入

app.notFound(() => h('div', {}, '404'))

serveUI(app, { root: '#root' })             // = serve(router)：绑定根节点 + URL 监听
```

## 核心概念

### req / res / serveUI（数据与落地分离）

| 概念 | 含义 | 说明 |
|------|------|------|
| req | `window.location` | 浏览器原生 Location，不做包装 |
| res | `VNode` | handler 返回的数据结构（type/props/key 树） |
| serveUI | VDOM | 落地机制：`renderValue` 挂载 / `patchValue` 增量 diff |

handler 只产 VNode，落地由 serveUI 决定——SSR 是链尾落地中间件（VNode→HTML），
SPA serveUI 是另一落地（VNode→DOM）。

### handler = 异步组件

```ts
type UIHandler<C> = (location: Location, ctx: WfuiContext & C) => Promise<VNode | null> | VNode | null
```

- 首次调用 = mount（取数 + $ 创建），`$` 赋值 = render
- **取数纪律**：必须走 `ctx.ui.data.get(key, fetcher)`——缓存命中保证"外层只使用一次"
  （重渲染不重取数）；直接 fetch 会每次重请求
- **$ 确定性初始化**：`$.x = $.x ?? 初始值`（重渲染时 $ 已存在，不能每次重置）

### 中间件 = 两阶段（layout 与 SSR 都是中间件）

```ts
type UIMiddleware<I, O> =
  (location, ctx, children) => Promise<UIHandler<O>> | UIHandler<O>
```

外层 mount（拿 children 下一层 handler），内层每次渲染调 children：

```tsx
const Layout: UIMiddleware = async (location, ctx, children) => {
  return async (loc, c) => {
    const child = await children(loc, c)   // 必须 await（children 是 async handler）
    return h('div', { class: 'shell' },
      h('nav', {}, ...),
      child,
    )
  }
}
app.use(Layout)
```

### 子路由

```ts
const admin = new UIRouter()
admin.get('/users', () => h('div', {}, '用户管理'))
app.use('/admin', admin)   // 挂载到 /admin/users
```

## $ 响应式（两层绑定）

| 层级 | 触发 | 重渲染范围 |
|------|------|-----------|
| 路由实例级 `$`（handler 的 `ctx.ui.$()`） | 赋值 | 重渲染 handler（data 缓存命中） |
| 组件级 `$`（子组件 `ctx.ui.$()`） | 赋值 | **仅该组件**（父 handler 不重跑） |

```tsx
// 交互子组件（两阶段 + 组件级 $）
const Counter = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.count = 0
  return (props) =>
    h('div', {},
      h('button', { onClick: () => $.count++ }, '+'),
      h('span', {}, String($.count)),
    )
}
```

## 列表与 key

```tsx
h('ul', {},
  ...items.map(it => h('li', { key: it.id }, it.label)),
)
```

同 key 项复用 DOM（不重建），顺序变化移动、消失移除。

## SSR + hydration

```tsx
import { renderHtml } from './src/ui-dom/ssr.ts'
import { serveUI } from './src/ui-dom/index.ts'

// 服务端：renderHtml(vnode) → HTML（事件剔除、文本转义）
const html = renderHtml(h('div', {}, '内容'))

// 客户端：serveUI hydrate 收养服务端 HTML（只接线事件，不重建）
serveUI(app, { root: '#root', hydrate: true })
```

## ctx 注入

| 字段 | 说明 |
|------|------|
| `ctx.params` | 路由参数（`/users/:id` → `{ id: '42' }`） |
| `ctx.query` | URL query 解析对象 |
| `ctx.ui.$()` | 响应式状态（路由实例级） |
| `ctx.ui.data.get/set/has` | 数据管道（缓存命中 + 并发合并） |
