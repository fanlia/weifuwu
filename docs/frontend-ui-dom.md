# ui-dom — 前端路由（UIRouter + uiServe，试验性）

> **试验性**：`src/ui-dom/` 是定稿架构（`design/ui-architecture.md`）的落地——
> **UIRouter（纯路由）+ uiServe（渲染运行时）**，复用 `weifuwu/components`
> （VNode 契约共享，组件零修改）。渲染算法复制自 client（局部 registry 隔离，
> 不与 createApp 交叉）。当前未随 npm 包发布，源码直用。
>
> 概念对齐：**req = window.location**，**res = VNode**（数据结构），
> **uiServe = VDOM**（落地机制），**params/query 在 ctx**（对齐后端 `ctx.params`）。

## 快速开始

```tsx
import { UIRouter, uiServe, h } from './src/ui-dom/index.ts'
import { toast } from './src/ui-dom/Toast.ts'
import { Button } from './src/components/index.ts'

const app = new UIRouter()

app.use(toast()) // ctx 注入链（对齐后端 app.use——注入 ctx.toast）

// handler = 异步组件：async (location, ctx) => VNode（$ 有效）
app.get('/', async (location, ctx) => {
  const info = await ctx.data.get('/api/info', async () => ({ title: '首页' }))
  const $ = ctx.ui.$()
  $.clicks = $.clicks ?? 0
  return h('div', {},
    h('h2', {}, info.title),
    h(Button, { onClick: () => $.clicks++ }, `点击 ${$.clicks} 次`),
    h(Button, { variant: 'secondary', onClick: () => ctx.toast?.('提示', 'success') }, '弹 toast'),
  )
})

app.get('/users/:id', (location, ctx) => h('div', {}, `用户 ${ctx.params.id}`))
app.notFound(() => h('div', {}, '404'))

uiServe(app, { root: '#root' }) // 装配点：路由已注册 → serve 监听 URL → 渲染
```

## 核心概念

### req / res / 落地分离

| 概念 | 含义 |
|------|------|
| req | `window.location`（浏览器原生，不包装） |
| res | `VNode`（handler 返回的数据结构） |
| uiServe | VDOM 落地（renderValue/patchValue diff·patch DOM） |
| ssrPage | 服务端落地（renderSsr → HTML + `__DATA__`） |

handler 只产 VNode，落地由 serve 决定——SSR 与 SPA 是两种落地，同一 router 定义共享。

### UIRouter 三态 use（对齐后端 app.use）

| 形态 | 签名 | 用途 |
|------|------|------|
| ctx 注入 | `use(mw: AppMiddleware)` | `(ctx) => ctx`——注入 ctx.toast/confirm 等（类型累积 `UIRouter<C & O>`） |
| 渲染中间件 | `use(mw: UIMiddleware)` | `(location, ctx, children) => (location, ctx) => vnode`——layout/SSR 包装 children |
| 子路由 | `use(prefix, sub)` | 独立路由树（sub 的中间件/notFound/嵌套均生效） |

运行时按 `arg.length` 区分（1 参 = ctx 注入；3 参 = 渲染）。

### components 复用（零修改）

VNode 契约与 client 共享（Fragment/Portal symbol 同一份）——components 产的 VNode
直接被 ui-dom 渲染器识别。渲染算法（render/diff/createUi 19 原语）复制到 ui-dom，
**registry/popup-tracker/dirty 集合局部实例**（不与 createApp 交叉）。

命令式工厂（toast/confirm/notification）复制到 ui-dom（`src/ui-dom/Toast.ts` 等）：
components 版 import client 的 mountVNode（模块级 registry）会注册错——ui-dom 版用局部。

### $ 响应式（两层）

| 层级 | 触发 | 重渲染范围 |
|------|------|-----------|
| 路由实例级 `$`（handler 的 `ctx.ui.$()`） | 赋值 | 重渲染 handler（data 缓存命中） |
| 组件级 `$`（子组件 `ctx.ui.$()`） | 赋值 | **仅该组件**（父 handler 不重跑） |

## SSR + hydration（端到端）

```tsx
// 服务端（Node 无 DOM）：ssrPage → 完整 HTML + __DATA__
import { ssrPage } from './src/ui-dom/ssr.ts'
import { app } from './router.ts' // 路由定义两端共享

const { page } = await ssrPage(app, { url: '/users/42' })

// 客户端：uiServe hydrate（收养服务端 HTML + __DATA__ 种子命中不重取数）
uiServe(app, { root: '#root', hydrate: true })
```

- SSR 时 `ctx.data.get` 写入 dataStore → `__DATA__` 脚本；hydrate 从种子同步命中
- renderSsr：组件两阶段 + asyncComponent await（数据 per-request）/ Portal 内联 / 事件剥离
- SSR 确定性：ui 19 原语 shim 全 no-op（不启动监听/会话）；渲染期非确定性由开发者规避

## ctx 注入

| 字段 | 说明 |
|------|------|
| `ctx.params` / `ctx.query` | 路由参数 / URL query（顶层，对齐后端） |
| `ctx.data.get/set/has` | 数据管道（缓存 + in-flight 合并 + `__DATA__` 种子） |
| `ctx.ui.*` | 19 原语（`$`/`dirty`/`render`/`usePopup`/`useChat`/`useInView`…） |
| `ctx.browser.*` | 环境抽象（复制自 client） |
| `ctx.toast` / `ctx.confirm` / `ctx.notification` | 命令式注入（`app.use(toast())` 等） |

## demo

`apps/ui-router-demo`：UIRouter + uiServe + components（Button/Input/Tag/Dropdown）
+ toast 注入 + 嵌套路由 + SSR/hydrate 端到端。
启动：`node apps/ui-router-demo/server.ts` → http://localhost:3100
