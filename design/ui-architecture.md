# 前端 UI 架构设计 — UIRouter + VDOM（req/res 定义）【定稿】

> **状态（2026-10）**：**已定稿**（纯设计，未实现）。前端 UI 完全对齐后端 Router 模型——
> **req = window.location，res = VDOM（VNode 树 + 落地机制），params/query 在 ctx**，落地 = VDOM patch/diff 到真实 DOM。
> **handler = 异步组件**（`async (location, ctx) => vnode`，`$` 有效）；**layout 与 SSR 都是中间件**。
> 平行于现有 createApp/router() 新增，成熟后完全替换。

## 〇、核心决策链（定稿依据）

```
req = window.location（浏览器原生，不包装）
res = VDOM（VNode 树 + renderValue/patchValue 落地机制）
params/query 在 ctx（对齐后端 ctx.params/ctx.query）
handler = 异步组件：async (location, ctx) => vnode（三层 asyncComponent 折叠成一层）
  └─ ctx.ui.$() 有效：首次调用 = mount（取数 + $ 创建，只一次）；$ 赋值 = render（ctx.data 缓存命中 + $ 复用）
middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode
  └─ layout 与 SSR 都是中间件（包装/落地 VDOM）
UIRouter + VDOM：平行新增，成熟后替换 createApp/router()
```

## 一、req/res 定义

| 维度 | 后端 | 前端 |
|------|------|------|
| **req** | `Request`（url/method/headers/body） | **`window.location`**（浏览器原生 Location） |
| **res** | `Response`（status/headers/body） | **`VDOM`**（VNode 树 + 落地机制） |
| params | `ctx.params`（Router 解析 URL 注入） | **`ctx.params`**（UIRouter 解析 URL 注入） |
| query | `ctx.query` | **`ctx.query`** |
| 落地 | HTTP 序列化发送 | **VDOM patch/diff → 真实 DOM** |

### VNode vs VDOM

```
VNode = 数据结构（单个节点）        VDOM = VNode 树 + 落地机制（能力）
{ type: 'div', props, key }        renderValue(vnode) → 挂载到 DOM
单个节点的描述                      patchValue(old, new) → 增量 diff
```

- **VNode**：数据结构单元（type/props/key）
- **VDOM**：VNode 树 + renderValue（挂载）/ patchValue（diff）——**res 是 VDOM**

**为什么 res = VDOM**：handler 返回一棵可落地的树（非裸节点），落地需机制（renderValue/patchValue）；对齐后端 Response = "完整可发送的响应"，VDOM = "完整可渲染的树"。

## 二、签名定义（对齐后端）

### route handler = 异步组件（单层，`$` 有效）

```ts
// handler = async (location, ctx) => vnode——首次调用 = mount，$ 赋值 = render
const UserPage = async (location, ctx) => {
  // ── 首次调用（mount，只一次）：取数 + $ 创建 ──
  const user = await ctx.data.get(`/api/users/${ctx.params.id}`)  // 重渲染时缓存命中（不重取）
  const $ = ctx.ui.$()                                            // 绑定路由实例（同 URL 共享）
  $.liked = $.liked ?? false                                      // 确定性初始化

  // ── 返回 VNode（$ 赋值 → 缓存命中重跑 → 新 VNode → patch）──
  return (
    <div>
      <h1>{user.name}</h1>
      <button onClick={() => $.liked = !$.liked}>{$.liked ? '❤️' : '🤍'}</button>
    </div>
  )
}
ui.get('/users/:id', UserPage)   // 注册（对齐后端 get(path, handler)）
```

**"外层只使用一次"的机制**（与两阶段组件 mount 对齐）：
```
首次渲染:  handler 调用 → ctx.data.get 真请求 → $ 创建 → VNode → DOM
   ↓ ($.liked++)
$ 赋值 → dirty → 重渲染：ctx.data.get 缓存命中（秒回，不重取）→ $ 同实例（状态保留）→ 新 VNode → patch
   ↓ 路由变化
新 URL → 新路由实例（新 mount，新 $，ctx.data 按新 key 取数）
```

| 两阶段组件 | 单层 handler（$ 有效） |
|-----------|----------------------|
| mount（一次）：$ 创建 + 初始化 | 首次调用（ctx.data 取数 + $ 创建 + `?? 初始值`） |
| render（每次 dirty）：返回 VNode | $ 赋值重渲染（缓存命中 + $ 复用 → 新 VNode） |
| $ 绑定组件实例 | $ 绑定**路由实例**（同 URL 共享） |

**本质**：单层 handler = **异步组件**（三层 asyncComponent 折叠成一层）——async 取数 + $ 响应式状态 + VDOM 输出，签名对齐后端 `(req, ctx) => Response`。

**职责分层**（可选下沉）：
- **页面** = handler（取数 → VDOM）——路由级渲染
- **交互子组件** = Component（两阶段 + $）——handler 返回的 VDOM 里的子节点（VDOM diff 同 type 复用保留状态）
- **简单页** = 同步 handler（直接返回 VNode）

### 类型签名

```ts
// 后端（已有）
type Handler<T> = (req: Request, ctx: T) => Response | Promise<Response>
type Middleware<In, Out> = (req: Request, ctx: In, next: Handler<Out>) => Response | Promise<Response>

// 前端（目标）
type UIRequest = Location
type UIResponse = VNode | null

/** UI 路由处理器 = 异步组件：async (location, ctx) => vnode（$ 有效） */
type UIHandler<C> = (location: Location, ctx: WfuiContext & C) => Promise<UIResponse> | UIResponse

/** UI 中间件 = 两阶段 async：外层 mount（拿 children）/ 内层 render（包装子 VNode） */
type UIMiddleware<I, O> = (
  location: Location,
  ctx: WfuiContext & I,
  children: UIHandler<O>,
) => Promise<UIHandler<any>> | UIHandler<any>
```

### 中间件两阶段（与组件模型对齐）

```ts
const AuthLayout = async (location, ctx, children) => {
  // ── 外层（mount 一次）：接收 children（下一层 handler），可初始化/订阅 ──
  const session = await loadSession()

  // ── 内层（每次渲染）：调 children 得子 VNode 再包装 ──
  return async (location, ctx) => {
    if (!session) return h(Login, {})
    return h('div', { class: 'shell' }, h(Sidebar), await children(location, ctx))
  }
}
ui.use(AuthLayout)
```

**渲染链（洋葱）**：
```
外层（mount 一次）:  mw1 外层 → mw2 外层 → ... → handler（装链，children 逐层传递）
内层（每次渲染）:  mw1 内层(loc, ctx) → mw2 内层(loc, ctx) → handler(loc, ctx) → VNode
                    ↑ 每层调 children(loc, ctx) 进入下一层
```

## 三、UIRouter 结构（对齐后端 Router）

```ts
class UIRouter<C extends object = {}> {
  use<I, O>(mw: UIMiddleware<I, O>): UIRouter<C & O>   // 中间件
  use(prefix: string, sub: UIRouter): this              // 子路由挂载（= mount(path, subRouter)）
  get(path: string, handler: UIHandler<C>, opts?: { title?: string }): this  // 页面路由
  notFound(handler: UIHandler<C>): this                 // 404
  close(): void                                         // 释放
}
function serveUI(ui: UIRouter, opts: { root: string | Element }): { close(): void }
```

**渲染管线**：
```
URL 变化（popstate/hashchange）
  → req = window.location
  → matchRoute(location.pathname) → 匹配 handler + 注入 ctx.params/ctx.query
  → 中间件链：mw1(loc, ctx, children) → mw2 → ... → handler(loc, ctx) → VDOM
  → 落地：renderValue（首次）/ patchValue（diff）→ 真实 DOM
```

**layout 与 SSR 都是中间件**：
```
后端:  mw1(req, ctx, next) → ... → handler(req, ctx) → Response
前端:  mw1(loc, ctx, children) → ... → handler(loc, ctx) → VDOM → 落地
layout = 包装 next 的 VDOM（children）；SSR = 链尾落地中间件（VDOM → HTML）
SPA serveUI = 另一落地（VDOM → DOM）——handler 只产出 VDOM，落地由中间件决定
```

## 四、与现有能力的映射

| 现有 | UIRouter 架构中的角色 |
|------|----------------------|
| `renderValue`/`patchValue`（VDOM） | **落地器**：VDOM → 真实 DOM |
| `createApp` 渲染引擎 | 保留（UIRouter 复用其 VDOM 落地能力） |
| `router()` 中间件 + RouteDef | 被 `UIRouter.get()` 取代（handler 注册） |
| `RouteView`（chain 深度） | 被 "layout = 中间件" 取代（children 即下一层） |
| `ctx.route` | 拆为 `ctx.params`/`ctx.query`（对齐后端） |
| layout 组件（两阶段） | UIMiddleware（两阶段 async——包装 children 的 VNode） |
| `asyncComponent`（三层） | handler = 单层异步组件（三层折叠，`$` 有效）——asyncComponent 保留兼容 |

## 五、实现步骤

| 步骤 | 内容 | 依赖 |
|------|------|------|
| S1 | 定义类型：`UIRequest`(=Location) / `UIResponse`(=VDOM) / `UIHandler` / `UIMiddleware` | 纯类型 |
| S2 | `UIRouter` 类：use/get/notFound + 匹配 + ctx.params/query 注入 + `$` 路由实例绑定 | S1 |
| S3 | `serveUI`：URL 监听 + 中间件链执行 + VDOM 落地 | S2 |
| S4 | 平行导出（weifuwu/client 新增 UIRouter/serveUI，createApp/router 保留） | S2/S3 |
| S5 | 成熟后替换 createApp/router | 浏览器冒烟验证后 |

## 六、诚实裁剪

- **不删 createApp/router()**：平行新增，成熟后替换（现有 1962 测试 + apps 零破坏）
- **req 不做包装**：直接 window.location（原生 Location 够用）
- **UIHandler = 异步组件**：`async (location, ctx) => vnode`，`$` 有效（路由实例级）——签名对齐后端，能力保留响应式
- **handler 取数纪律**：必须走 `ctx.data.get`（重渲染缓存命中保证"外层一次"）；直接 fetch 会每次重请求
- **$ 确定性初始化**：`$.x = $.x ?? 初始值`（重渲染时 $ 已存在，不能每次重置）
- **不做请求级 ctx**：前端 ctx 应用级；params/query 是当前渲染请求的解析结果（serveUI 每次 URL 变化更新）
- **asyncComponent 三层保留兼容**：handler 单层是新形态，三层可继续用（内部同语义）
