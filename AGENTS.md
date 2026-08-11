# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> **框架使用者**请查阅 [README.md](./README.md)。
>
> **纪律均来自真实事故**——每条都对应一次真实操作/单测抓出的 bug。改代码前先读对应章节。

---

## 1. 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`, `ctx.user`/`ctx.auth`（userSystem）, `ctx.limit`（rateLimit）, `ctx.email`（email）, `ctx.queue`（queue）, `ctx.schedule`/`ctx.cron`/`ctx.cancelCron`（scheduler）, `ctx.ai`（ai：chat/stream/agent/approve）
- **DB 契约层**（`src/db/contracts.ts`）——接口与实现分离：`PoolConnection`（pg/redis 通用连接：生命周期+健康）、`Sql`（ctx.sql）、`Redis`（ctx.redis，含 `createConnection()` 独立连接工厂）；自研引擎（PgConnection/RedisClient/RedisPool）implements 接口，消费方只依赖接口类型（引擎组装点：postgres()/redis() 中间件与 queue 的 `new`）
- **域契约层**——`src/email/contracts.ts`（`Mailer` → ctx.email）、`src/ai/contracts.ts`（`Ai` → ctx.ai）：同模式，中间件引擎实现接口，消费方只依赖接口类型
- **queue 注入模式**（模式 A 显式注入）：`queue({ redis })` 必传 Redis——池命令走轮询连接，worker 阻塞读走 `redis.createConnection()`（不占池）；所有权在调用方（queue.close() 不关闭注入 redis）；scheduler 走 `queue: QueueClientModule` 参数复用
- **render-only 状态驱动** — 渲染唯一触发 `ctx.ui.render()`（闭包绑定组件）；状态是普通对象（`let` + `render()` / `createStore` + `useExternal` 订阅）——无 `$` Proxy、无隐式触发
- **组件签名** — `(initProps, ctx) => (props) => VNode | null`（两阶段模型）
- **VDOM 支持 innerHTML** — 直接用 `innerHTML` prop
- **ref 管理 DOM** — `ref={el => { if (el) init; else cleanup }}`

## 2. 核心标准速查

| ID | 规则 | 代码中的体现 |
| --- | --- | --- |
| CS-01 | `throw`/`return` 后不留死代码 | if-else 都需 return |
| CS-02 | Promise 必须 await 或 catch | 无 `.then()` 无 catch |
| CS-03 | Event listener 内用 `console.error` 不用 `throw` | `server.on('error', ...)` |
| CS-04 | **DB 客户端测试必须连 docker 真实库** | 禁 mock 网络层；故障注入用 CLIENT KILL / pg_terminate_backend |
| CS-05 | **协议层改动：TDD 先行 + 诚实裁剪** | 新能力先写测试（红→绿）；不支持能力抛 `ProtocolError('unsupported')` |
| CS-06 | **行为变更先查旧测试**：默认值/时序变更后，旧测试可能静默挂起而非失败 | `await promise` 永不 resolve = 挂起信号；`--test-timeout` 定位 |
| FS-01 | 组件 = `Component<P, C>`：`(initProps: P, ctx) => (props: P) => VNode` | 无 class/hook/this；P=props（JSX 自动推断），C=ctx 注入依赖 |
| FS-02 | 组件必须类型化：`Component<P, C>`，ctx 注入声明 C | 禁止 `_init: any`；`ctx.api` 等由 C 泛型编译期保证 |
| FS-03 | 渲染只发生在 `render()` 调用处 | 事件/定时器里改状态后 `ctx.ui.render()`——禁止隐式触发/`$` Proxy（render-only，design/render-only-plan.md） |
| FS-04 | 禁止 eval/new Function | 安全基线 |
| FS-05 | 前端无 npm 运行时依赖 | client 包 import 无外部 dep |
| PS-01 | 请求路径无同步 I/O | 无 readFileSync/execSync |

## 3. 组件模型

### 3.1 两阶段模型与核心规则

**外层函数 = mount（只一次）**，**内层返回函数 = render（每次 `render()` 触发/props 变化）**。

| 参数 | 作用域 | 说明 |
|------|--------|------|
| `initProps` | mount 阶段 | 组件首次渲染时的 props，用于初始化 |
| `props` | render 阶段 | 每次渲染时保持最新值的 props |

```tsx
// ✅ 正确：状态是普通对象（render-only——改状态后显式 render()）
const Counter = (initProps, ctx) => {
  let count = initProps.initial ?? 0
  return (props) =>
    h('button', { onClick: () => { count += props.step ?? 1; ctx.ui.render() } }, count)
}

// ❌ 错误：用 mount 时捕获的 props 渲染，值永远不更新
const Bad = (props, ctx) =>
  () => h('div', {}, props.label)  // props.label 不会随父组件更新
```

### 3.2 组件两种形态

**无状态**（只用 props）：

```tsx
const Badge: Component<{ variant: 'primary' | 'muted' }> = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

**有状态**（普通对象 `let` + 显式 `render()`）：

```tsx
const Toggle: Component = (_init, ctx) => {
  // ── mount（只一次）──
  let on = false
  // ── render（每次 render() 触发/props 变化）──
  return (props) =>
    h('button', { onClick: () => { on = !on; ctx.ui.render() } }, on ? '开' : '关')
}
```

> **render-only 唯一规则**（design/render-only-plan.md）：渲染只发生在 `render()` 调用处——
> 状态回归普通 JS 对象（`let` / `createStore`），行为可静态推导、测试无 mock 盲区。

### 3.3 两阶段异步组件（唯一组件形态）

> **weifuwu 只支持这一种组件签名**：`async (initProps, ctx) => (props) => vnode`——外层工厂（mount，可 await 数据）+ 内层 render 函数（同步）。渲染器按「返回值是 Promise」原生判别；同步组件已不支持（Component 类型强制 Promise 返回）。

```tsx
const UserProfile = async (initProps, ctx) => {
  // ── 工厂层（异步边界）：数据声明——ctx.data.get 三场景自动（SSR→__DATA__ / hydration 种子 / SPA fetch）──
  const user = await ctx.data.get(`/api/user/${initProps.userId ?? ctx.params.id}`)

  // ── mount 后返回 renderFn：let 状态 + 交互（render-only）──
  let liked = false

  return (props) =>
    h('div', {},
      user.name,  // 服务端状态（闭包，SSR 进 HTML）
      h('button', { onClick: () => { liked = !liked; ctx.ui.render() } }, liked ? '❤️' : '🤍'),
    )
}
```

关键规则（模式 A——design/async-mode-a-plan.md）：
- **主路径 await 全部**：首帧/导航 = `buildVNode`（async 预构建：await 全部工厂；兄弟 Promise.all 并行；零 DOM）→ 完成后 `renderValue`/`patchValue` 一次落地——**无占位、无闪烁**；导航旧页保持到新树就绪（原子切换）
- **旧树对照复用**：同位置同类型组件复用 `_render`（工厂不重跑，let/ref 状态保持）；`ctx.data` 缓存兜底并发合并
- **运行时首次挂载的 async 组件**：在 `buildVNode` 阶段 await（构建完成）→ diff 同步渲染——无占位/注释/补全回调（第 1 代死循环已根治）
- 工厂按**实例**执行（N 处实例 = N 次工厂调用）；**数据必须走 ctx.data**（自带缓存+并发合并，重复执行零成本）——禁止副作用/昂贵操作裸写工厂
- 工厂拿 `initProps` + `ctx`（与同步组件同签名）；initProps 不同的实例各得各自数据（T3 隔离）
- **骨架屏**：`uiServe(router, { root, loading: true })` 不清空 root（预置骨架屏 HTML）→ 首帧原子替换；`handle.ready` = 首帧完成 Promise
- 初始状态必须确定性（禁止 `window.innerWidth` 之类直接初始化 → mismatch）
- 已裁剪：Suspense 边界/fallback（无生产使用点，已删）；async 工厂 reject 无错误 UI/重试（保持占位）

### 3.4 ctx.data — 数据管道（工厂层取数）

| API | 语义 |
| --- | --- |
| `ctx.data.get(key, fetcher?)` | 缓存命中 → 直接返回；未命中 → 调 fetcher 并缓存；同 key 并发合并 |
| `ctx.data.set(key, value)` | 写缓存（如手动失效/预置） |
| `ctx.data.has(key)` | 是否存在缓存 |

- **key 约定即 URL**（`/api/posts/1`），天然唯一；key 必须包含数据维度（route params、userId）
- **三场景自动适配**：SSR（服务端真 fetch，结果序列化进 `__DATA__`）/ hydration（`window.__DATA__` 种子同步命中）/ SPA（未命中触发 fetcher）
- **失效**：工厂缓存绑定页面上下文——路由导航/登录登出时 `clearAsyncComponentCache()` 自动失效
- **个性化数据不进 ctx.data**：SSR 会把工厂取数结果序列化给所有客户端——会话/用户相关数据污染索引且泄露——留在客户端 `let` + fetch + `render()`

### 3.5 SSR（SPA/SSR 透明）

- **SSR 与客户端共享同一 UIRouter**：`uiSsr`（RouteDef[] 声明式 SSR 中间件）已删除——路由定义只有 UIRouter（`get/use/notFound`）一份，`ssrPage(router, { url })` 服务端落地、`uiServe(router, { hydrate: true })` 客户端收养；匹配/参数注入两端同源
- **`weifuwu/dev`**（`src/dev/index.ts`）：Node `registerHooks` + esbuild 同步编译 `.ts/.tsx`，服务端直接跑 `.tsx`——与 `ctx.ui.js` 前端动态编译对称，两端同一 JSX 运行时
- **`ctx.ui.ssr(Comp, props, { data })`** → HtmlSafe HTML 片段；`ctx.ui.ssrData(data)` → `__DATA__` 脚本：

```ts
const data = new Map()
const html = await ctx.ui.ssr(BlogPage, {}, { data })
return ctx.ui.html`<div id="root">${html}</div>${ctx.ui.ssrData(data)}`
```

- 服务端 ctx shim：hooks no-op、`ctx.data` 预取去重、`selfId` 请求级隔离（SSR 无 `render` 语义）
- **诚实裁剪**（CS-05）：渲染期非确定性（Date/Math.random/locale）导致 SSR/hydration mismatch——dev 检测，文档红线；个性化数据不上 SSR

## 4. 状态与渲染

### 4.0 vdom 核心原则：无自动渲染（渲染时机完全由用户显式操作决定）

> **render-only（design/render-only-plan.md）：只有 `ctx.ui.render(ids?)` 一种触发渲染，除此之外没有任何自动渲染**。
> `$` Proxy / `ctx.ui.dirty()` 已删除——状态是普通对象（`let` / `createStore`），改状态后必须显式 `render()`。
> 行为可静态推导：代码审查看事件回调里有无 `render()` 即可验证渲染逻辑。

**禁止的自动渲染机制**（vdom 引擎红线——`src/ui-dom/vdom/`）：
- ❌ **无响应式引擎/Proxy 赋值触发**——状态是普通对象，无 `set` trap、无隐式 dirty
- ❌ **无 flush/微任务批处理调度层**——`render()` 直接 fire-and-forget 渲染（`renderByIds`），不经过"dirtySet → 微任务批量 flush"
- ❌ **无 resolve 回调补渲染**——async 组件工厂 resolve 即构建完、构建完即渲染，**没有"resolve 后触发父级重渲染"的回调**（第 1 代死循环根因：mountComponent → resolve → scheduleLocalRefresh → renderByIds → diff 又动态挂载 → 无限）
- ❌ **无占位/注释/补全定位机制**——动态挂载组件在 `buildVNode` 阶段 await（构建完成）→ diff 同步渲染
- ❌ **无渲染循环**（runLoop）——渲染结束后不检查/不补跑任何待渲染项

**渲染管线（两阶段）**：
```
用户操作（ctx.ui.render()）
  → renderByIds（async）
    → buildVNode（await 动态挂载组件——工厂只跑一次，_render 缓存）
    → patchValue（同步 diff——只处理已构建树，永不调工厂）
```

**关键不变量**：
- 组件 vnode 进入 diff 前**必须已构建**（`_render` 已设）——diff 遇未构建组件直接抛错（开发期暴露）
- 防重入：同一组件 id 同时只跑一次渲染（渲染中再次触发 → 跳过——错过由下次用户操作捕获，**不补跑**）
- 工厂只跑一次：vnode 级缓存 + 旧树同位置同类型复用（跨渲染保持组件内部状态）
- **ctx 版本（bumpCtxVersion）**：i18n 等全局状态变化时递增——buildVNode 剪枝 + diff 三态 skip 比较 `_ctxVersion`，版本不同强制重跑 renderFn（`_ctxVersion` 未接线是 i18n 切换不更新的根因，已修复 + 回归测试）
- mount 保护期（工厂执行）`render()` 调用被 `_render` 守卫天然拦截（未挂载组件跳过）

**实现位置**：`src/ui-dom/vdom/`（build.ts / diff.ts / render.ts / scheduler.ts / mount.ts / registry.ts / hydration.ts / ssr.ts）——第 2 代引擎，替代第 1 代（render.ts/diff.ts 顶层文件）的占位/补全/批处理机制。

### 4.1 状态存放位置

| 状态类型 | 存放位置 | 触发渲染 | 例子 |
|---------|---------|---------|------|
| 组件内部状态 | 闭包变量 `let` | 改后调 `ctx.ui.render()` | `let count; count++; ctx.ui.render()` |
| 共享状态 | `createStore()` + `ctx.ui.useExternal(store)` | store.set/update/notify 自动 | 跨组件全局状态（登录态、主题） |
| 内部缓存（不触发渲染） | 闭包变量 `let` | 不触发 | `let el`, `let timerId` |
| DOM 引用 | 闭包变量 + ref | 不触发 | `let wrapEl; ref={e => wrapEl=e}` |

```tsx
const Popover = (_init, ctx) => {
  let show = false
  let wrapEl: HTMLElement | undefined
  return (props) =>
    h('div', {
      ref: (el) => { if (el) wrapEl = el },
      onClick: () => { show = !show; ctx.ui.render() }
    })
}
```

### 4.2 渲染触发 API

| API | 触发时机 | 渲染方式 | 作用域 | 使用场景 |
|------|---------|---------|--------|---------|
| `ctx.ui.render()` | 主动调用 | 异步落地（fire-and-forget，`await` 可精确等待） | 当前组件 | **唯一渲染触发**；改状态后调用；`await ctx.ui.render()` 后拿最新 DOM（测量/动画） |
| `ctx.ui.render(['id'])` | 主动调用 | 异步落地 | 指定组件 | **跨组件精准刷新** — 全局事件、Portal 远程控制 |
| `ctx.ui.useExternal(store)` | 订阅共享状态 | store 变化自动重渲染（unmount 退订） | 当前组件 | **跨组件共享状态** — createStore 唯一消费通道 |
| `ctx.ui.useMedia()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **响应式媒体查询** — 断点变化自动重渲染 |
| `ctx.ui.useBreakpoint()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **命名断点** — mobile/tablet/desktop 自动重渲染 |
| `ctx.ui.usePopupPosition()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **弹层坐标跟随** — scroll/resize 自动重算 fixed 坐标 |
| `ctx.ui.useInView()` | 注册监听 | IO 合成器线程评估 | 当前组件 | **可见性观察** — `isIn` 响应式变化自动重渲染；替代组件自建 scroll 监听 |
| `ctx.ui.useScrollPosition()` | 注册监听 | 全局 scroll + rAF 节流 | 当前组件 | **滚动位置跟踪** — `y` 响应式（视口/内部容器通用）；Affix/VirtualList 使用 |
| `ctx.ui.useChat()` | 事件驱动 | 流式事件 → notify（useExternal 订阅） | 当前组件 | **AI 对话会话** — 消息累积/工具调用/HITL 审批（见 design/ai-contract.md） |

`render()` 无参 = 当前组件（闭包绑定，无 this 陷阱），传参 = 指定组件列表。hooks（useMedia/useInView 等）是**事件驱动**重渲染（浏览器事件 → render）——与 `$` 的"赋值自动"本质不同，保留合理。

### 4.3 `ctx.ui.selfId()` — 自定义组件 ID（跨组件精准刷新）

mount 阶段注册语义化 ID（同名冲突抛错，全局唯一），之后任意位置 `render(['id'])` 精准定位组件，绕过多层 props 传递：

```tsx
const StatsPanel = (_init, ctx) => {
  ctx.ui.selfId('stats')
  let data: Item[] = []
  return (props) => h('div', {}, ...)
}
// 组件 B（或其他地方）：ctx.ui.render(['stats'])
```

### 4.4 组件状态模式（内部 let + render / 共享 store + useExternal）

```
组件内部状态                        跨组件共享状态
┌──────────────────────┐          ┌──────────────────────────┐
│  OrderPage           │          │  createStore(init)       │
│  let orders = []     │          │  const store = ...       │
│  let loading = false │          │  // 任意组件订阅          │
│  onClick: fetch →     │          │  ctx.ui.useExternal(store)
│    orders = data      │          │  // store.set/notify →    │
│    ctx.ui.render()    │          │  // 订阅组件自动重渲染     │
└──────────┬───────────┘          └──────────────────────────┘
           │ props 传递
           ↓
┌─────────────────────────────────────────────┐
│  Table（组件库：内部 let + render）           │
│  let sortKey / ctx.ui.render()              │ ← props 变化驱动
│  return (props) => h('table', ...)          │ ← 内部 UI 状态手动
│    └─ Badge（无状态，只用 props）              │
│         return (props) => h('span', ...)    │
└─────────────────────────────────────────────┘
```

**组件库与业务层同一模式**（render-only 无第二套写法）：

```tsx
const DatePicker = (_init, ctx) => {
  let show = false
  let selectedValue = ''
  return (props) =>
    h('input', {
      onClick: () => { show = true; ctx.ui.render() }
    })
}
```

**共享状态（createStore + useExternal）**：

```tsx
const store = createStore({ user: null })   // 模块级单例
const UserBadge = (_init, ctx) => {
  const state = ctx.ui.useExternal(store)    // 订阅：store 变化 → 自身重渲染
  return (props) => h('span', {}, state.user?.name ?? '未登录')
}
// 任何位置：store.set({ user })/store.update(fn)/store.notify() → 订阅组件自动重渲染
```

**选择指南**：

```
需要渲染 → 改状态后 ctx.ui.render()（内部）或 store 变更（共享）
不需要渲染 → let x = val（内部缓存）
跨组件 → selfId + render(['id']) 或 createStore + useExternal
```

### 4.5 共享状态原语：`createStore` + `ctx.ui.useExternal`（替代 $ 的跨组件通道）

`createStore(init)`（`src/ui-dom/store.ts`）——普通对象状态 + subscribe/set/update/notify，**无响应式引擎**：

```ts
interface ExternalStore<T> {
  state: T                                   // 普通对象（非 Proxy）
  subscribe(cb: () => void): () => void      // 订阅（unmount 自动退订）
  set(partial: Partial<T>): void             // 合并写 + notify
  update(fn: (state: T) => void): void       // 可变写 + notify
  notify(): void                             // 手动通知
}
```

- `ctx.ui.useExternal(store)`：mount 阶段订阅，store 变化 → 自身重渲染（unmount 自动退订）；渲染期读 `store.state` 最新值
- SSR 无害：shim 返回 `store.state` 只读不订阅
- **useChat 会话**：handle 带 `subscribe(cb)`——`ctx.ui.useExternal(chat)` 订阅会话变化（替代已删除的 `__watch`）
- 高频 notify 风险：流式场景由写者控制频率（每 N token notify）——与防重入（渲染中丢请求）配合

> **历史教训（JSONViewer 折叠失效根因）**：v1 的 `$` Proxy dirty 回调在 mount 时捕获 selfId——重挂载场景下捕获的 selfId 与当前实例错位 → dirty 渲染孤儿实例，交互静默失效。render-only 方案根治：`render()` 闭包绑定组件 id（mountAsyncComponent 创建 childUi 时捕获），无 this/selfId 错位。jsdom 单测（mock `$` 为纯对象）无法暴露此类缺陷——**agent-browser 实测交互**仍是验收标准。

## 5. 组件纪律（红线——均来自真实事故）

### 5.1 ref 纪律：带清理逻辑的 ref 必须定义在 mount 作用域

weifuwu 的 ref-diff 在 **ref 函数引用变化时**调用旧 ref(null)（render.ts patch 逻辑）。若 ref 内联写在 render 里，每次重渲染都是新函数 → 旧 ref(null) 被调用 → 清理逻辑（退订 / removeEventListener / dispose）会在**每次渲染后**触发，而非仅在卸载时。

```tsx
// ❌ 内联 ref：每次渲染引用变化 → null 分支被反复触发（AiChat 流式不更新的根因之一）
return (props) =>
  h('div', { ref: (el) => { if (el) init(); else cleanup() } })

// ✅ 稳定 ref：定义在 mount 作用域，ref(null) 只在真正卸载时调用
const listRef = (el: any) => { if (el) init(); else cleanup() }
return (props) => h('div', { ref: listRef })
```

第三方库管理示例（EChart）：

```tsx
const EChart = (_init, ctx) => {
  let instance: echarts.ECharts | undefined
  return (props) =>
    h('div', {
      ref: (el) => {
        if (el) {
          instance = echarts.init(el)
          instance.setOption(props.option)
        } else {
          instance?.dispose()
          instance = undefined
        }
      },
      style: { width: '100%', height: '400px' }
    })
}
```

**ref 触发时机**（focus-trap 踩过）：ref 在元素 **appendChild 之前**触发（renderValue 先渲染子节点再调 ref，父层最后 append）——此时元素未连接文档，`el.focus()` 在 Chrome 无效。依赖连接态的 ref 初始化用 `queueMicrotask` 延迟。

### 5.2 受控组件纪律：受控 props 必须配回调（缺回调 = 静默不可点）

受控组件（`active`/`value`/`checkedKeys`/`month`/`open` 等传入时）状态由父组件独占，点击/选择的**唯一出口是回调**。缺回调时交互**静默失效**——真实操作抓出 6 个同款 demo bug（Collapse/Tree/Calendar/Cascader/Dropdown）：

- **组件**：受控 props 已传但无回调时 `console.warn` 明确提示（Collapse/Tree/Calendar/Cascader/Dropdown 已有防护）
- **新受控组件**必须自带同款 warn（防静默不可用）
- 非受控（不传受控 props）即可点击——**demo 要展示可交互用法**（受控配回调或非受控）

### 5.3 受控输入纪律：输入态不依赖受控 value 回流

**受控 input 的 value 由父组件控制——输入期间若只依赖 value 回流，父组件 render 会重挂 input → 焦点丢失**（AutoComplete/Select searchable 真实 bug，用户报告"输入框不能聚焦"）。

```tsx
// ❌ 依赖受控 value 回流（父 render 重挂 input → 焦点丢失）
// ✅ 组件内部输入态（不触发 onChange 回流）：输入期间 value 走内部 keyword
const input = ctx.ui.useControlledInput({ value, onChange, name: 'AutoComplete' })
// 输入 → input.setKeyword(v)（内部态）+ input.setValue(v)（触发 onChange）
// 选中 → input.setSelectedLabel(label)（关闭后 input 回填选中 label）
```

- **标准原语 `ctx.ui.useControlledInput`**（C3）：`value/setValue/keyword/setKeyword/selectedLabel/setSelectedLabel`——render 阶段调用（读最新 props）+ Map 缓存跨渲染保持
- **选中回填**：受控 demo 的 onChange 不渲染时 props.value 不回流 → input 空——用内部 `selectedLabel` 关闭后回填
- **IME composition**：中文输入法组合期间受控 value 重置打断 → `isComposing` 门控 + `onCompositionEnd` 处理最终值（对齐 Mentions/TagsInput）
- **数组 children 内的 input 需稳定 key**：真用户 keyed 列表中无 key 项每次渲染重建（lastIndex 算法）——**C1 已治本**：portal 内部 key（createPortal 的 portalKey）不算用户 keyed → `[input(无key), portal]` 走 allUnkeyed 按位置复用，不再重建（AutoComplete 已验证 replaced:0 + 焦点保持）

### 5.4 弹窗纪律：浮层必须 portal 渲染 + usePopup 复用

**所有脱离文档流的浮层（dropdown/select/datepicker/menubar/cascader/mentions/contextmenu/tooltip/popover/hovercard/modal/drawer/toast/notification/confirm/tour/command 等）必须 `createPortal` 渲染到 `#__wf_portal`（body）——禁止 `position: absolute` 相对父容器**（absolute 方案在父容器 overflow:hidden/transform/z-index 上下文下裁剪/错位——TreeSelect 曾遗漏）：

```tsx
// ✅ portal：渲染到 body——z-index/Escape/夹紧/跟随统一管理
const dropdown = open ? createPortal(h('div', { class: 'wf-xxx-dropdown', style: { position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px` } }, menu), 'xxx-dropdown') : null
```

**`ctx.ui.usePopup()` 能力清单**（C6——Select/AutoComplete/NavMenu/Popconfirm/Cascader 等全部复用，新弹层组件先查再实现，禁止重复造轮子）：

| 能力 | 说明 |
|------|------|
| **portal** | `popup.portal(content, key)` —— createPortal 到 #__wf_portal + fixed 定位 + 视口夹紧 |
| **定位** | placement（top/bottom/left/right）+ `center:false` 左对齐 + gap/margin |
| **打开自动 refresh** | 首次打开 + **锚点变化**（el 变化）自动重算坐标（C1 锚点感知） |
| **el-null fallback** | 嵌套弹层首帧锚点 ref 未挂载——微任务重试 |
| **外部点击关闭** | document mousedown——el/panel 外点击关闭（**禁止自建 overlay 遮罩——会挡按钮**） |
| **Escape 关闭** | document keydown |
| **ref 稳定** | portal 内部 ref 已稳定化（portalPanelRef——无内联 ref 警告） |
| **open getter** | `popup.open` 是 getter（渲染期读最新——非创建时快照） |

新弹层组件：`usePopup({ trigger, placement, el, isOpen, setOpen })` → `popup.portal(...)`——**不需要**自建 overlay、手动定位计算、手动 Escape/外部点击、手动 portal ref。

**硬性规则**：
- 浮层根元素必须 `position: fixed` + JS 坐标（禁止 absolute 定位 + CSS 坐标）
- 定位必须经 `usePopupPosition`（rect 跟随 + 视口夹紧）——打开时 `refresh()`
- portalKey 语义化（组件名）——同组件多个弹层需区分
- 弹层容器必须 `z-index: var(--wf-z-*)`（禁裸值，audit 强制）
- **测试注意**：portal vnode 的 `type` 是 Portal 组件（非字符串标签）——断言子内容用 `vnode.props.children` 递归

### 5.5 浏览器环境纪律：内置组件禁止直接访问 DOM 全局

**内置组件使用浏览器能力必须经 `ctx.browser`（环境 API）与 `ctx.ui.useXXX`（框架原语）——禁止直接 `window.`/`document.`/`navigator.`/`localStorage`/`matchMedia(`/`IntersectionObserver` 等 DOM 全局**（组件侧已清零，46 处迁移完毕）：

```tsx
const MyComp: Component = (_init, ctx) => {
  const browser = ctx.browser ?? createClientBrowser()  // ctx.browser 优先，fallback jsdom
  return (props) =>
    h('button', {
      onClick: () => {
        void browser.copyText('hello')      // 复制（勿自建 textarea+execCommand）
        const el = browser.byId('target')    // 查询
        const y = browser.scrollTop()        // 滚动量（scrollingElement 优先）
        browser.storageSet('k', 'v')         // 存储（SSR/隐私模式安全）
      }
    })
}
```

**能力映射表**（组件场景 → 唯一入口）：

| 能力 | 唯一入口 | 禁止的替代 |
|------|---------|-----------|
| 复制 | `browser.copyText` | `navigator.clipboard` / `document.execCommand` / textarea 自建 |
| 查询元素 | `browser.byId` / `browser.query` | `document.querySelector` |
| 创建/挂载容器 | `browser.createElement` / `bodyAppend` | `document.createElement` / `document.body.appendChild` |
| 键盘导航焦点 | `browser.activeElement` | `document.activeElement` |
| 选区 | `browser.getSelection` / `selectionText` | `window.getSelection` |
| 滚动量 | `browser.scrollTop`（scrollingElement 优先） | `window.scrollY`（headless 恒 0 漂移） |
| 存储 | `browser.storageGet/Set` | `localStorage` 裸调 |
| 主题根 | `browser.rootElement` | `document.documentElement` |
| 定时器 | `browser.timeout` | `setTimeout`（SSR no-op 保证） |
| 媒体查询 | `ctx.ui.useMedia` / `useBreakpoint` | `window.matchMedia` |
| 监听（键盘/指针/滚动/拖拽） | `ctx.ui.useGlobalKey` / `useDrag` / `useScrollPosition` / `useDragDrop` | `window.addEventListener` 自建 |
| 可见性 | `ctx.ui.useInView` | 自建 `IntersectionObserver` |
| 视口 | `ctx.ui.useVisualViewport` | `window.innerHeight` |

**三态实现**：客户端 `createClientBrowser`（惰性 typeof 防御）· SSR shim（null/0/false/no-op——组件 SSR 安全）· 测试 mock 或 jsdom fallback（`_ctx.browser ?? createClientBrowser()`）。

**浏览器全局审计基线**：`grep -rnE '\bwindow\.|\bdocument\.|\bnavigator\.|\blocation\.|\bhistory\.|\blocalStorage|\bgetSelection\(|\brequestAnimationFrame|\bMutationObserver|\bIntersectionObserver|matchMedia\(' src/components/*/*.ts`（排除注释后必须为 0——新组件引入即 CI 噪音）。

### 5.6 样式纪律

**小尺寸 button 必须固定 min/max-height**（全局 button 样式设 `min-height: 36px`——小尺寸按钮不覆盖会被撑成 36px 竖条，Tree checkbox 14x36 / Carousel 圆点 8x45 / Rate 星 16x36——真实操作抓出 6 处）：

```css
.wf-xxx-btn {
  width: 14px; height: 14px;
  min-width: 14px; max-width: 14px;
  min-height: 14px; max-height: 14px;
  line-height: 0; padding: 0; flex-shrink: 0;
}
```

**组件 CSS 不得与 layout 布局原语同名**（`.wf-grid` 组件类覆盖了 layout 双列布局——demo 回归；组件用 `wf-grid-comp` 类名——audit 第 21 条强制）。

## 6. 渲染器机制与已知坑（client 内部）

### 6.1 客户端模块状态共享（重要）

`weifuwu/client` 与 `weifuwu/components` **必须共享同一模块实例**（`idRegistry`/`_idCounter` 等状态只在 client 模块内存在一份）：

- **症状**：命令式中间件（`toast()` 等）挂载的组件注册在 components 自己的 idRegistry，但 `renderByIds` 走 app 的 registry（查 app 的 registry）→ 命中无关组件/漏渲染——真实 app 实测：toast 永不渲染，单测全绿（node --test 单模块图掩盖）
- **两道防线**：① `scripts/build.mjs` 组件构建外部化 `src/client/*` 导入 → `weifuwu/client`（dist 消费端共享）；② **app 的 tsconfig `paths` 必须同时映射 `weifuwu/client` 和 `weifuwu/components` 到 src**（dev 全 src 单图）——只映射 client 不映射 components 时，app 用 src 的 client、components 用 dist 的 client，状态仍重复
- 排查手段：浏览器探针 + 检查 bundle 内 `var _idCounter` 出现次数（>1 = 状态重复）；esbuild metafile 看 `src/client` 与 `dist/client` 是否同时被引用

### 6.2 enumerated 属性必须显式字符串（draggable 踩过）

`setProp`/`patchProps` 对 `value === true` 用 `setAttribute(key, '')`——适用于 boolean 属性（disabled/hidden），但 **enumerated 属性（draggable 等）空字符串解析为 false**——`<div draggable />` 实际 `el.draggable === false` → 拖动变成文本选中（Kanban 真实 bug）：

- render.ts/diff.ts 对 `draggable` 显式 `setAttribute('draggable', value ? 'true' : 'false')`
- 新 enumerated 属性（contenteditable 等）同理——**空字符串语义需查 HTML 规范**
- 防线：`src/test/client/draggable.test.ts`（el.draggable 真值断言——jsdom 可测）

### 6.3 数组 diff 与 key（C1 已治本）

**`patchKeyedChildren`（src/client/diff.ts）**：
- **全无 key**（含 portal——createPortal 的内部 key 不算用户 keyed，C1 修复）→ **按位置复用 + patch**（不重建）——受控 input 焦点保持
- **用户 keyed 混合**：无 key 项 Step 1 移除重建（React 等价——C1 治本边界）

### 6.4 其他渲染器坑

- **style diff 只设不删**：`display: undefined` 残留旧 none → 条件显隐组件失效（已修——`src/test/client/style-patch.test.ts` 防线）
- **事件 prop 判定必须 `on + 大写`（EVENT_RE）**：`diff.ts` 曾用 `key.startsWith('on')`——`once`/`only` 等 on 开头属性被误判为事件 → `addEventListener('ce', true)` 抛 TypeError 中断渲染。统一用 `EVENT_RE = /^on[A-Z]/`（render.ts 导出，diff.ts 复用）
- **事件 prop 非函数值守卫**：`onClick={true}` / 字符串不抛 DOMException——`console.warn` + 跳过（不中断渲染管线）；`addEventListener` 前 `typeof value === 'function'` 检查

## 7. 测试

### 7.1 命令与预算

- `node --test` 无 Jest/Mocha；`npm test` 无 pretest、**零外部依赖**（docker 不参与测试——见 §7.4 测试范围）
- **bash 命令 timeout 原则**：运行测试/脚本的 `bash` 命令必须设 `timeout`（**≤15 秒**），并优先加 `--test-timeout`（如 `timeout 15 node --env-file=.env --test --test-timeout=8000 ...`）——真库/集成测试卡住时能快速定位；卡住时用更短 timeout 复跑缩小范围
- **全量测试总时长预算：≤ 15 秒**（实测 ~11.5s，db 真库 191 个测试占 ~4.3s）。**超过 15 秒 = 必须排查**：
  1. **资源未释放**：db 连接未 `close()`、redis 订阅未退订、jsdom 定时器未清（setTimeout/interval 未 clear——挂起比失败更难定位）、全局 document/mutation 监听未 remove
  2. **新增测试自身慢**：长按/动画测试的 sleep（`usePopup` longpress 500ms×2 是已知最慢项）；改为事件驱动断言
  3. **串行瓶颈**：`--test-concurrency=1` 文件串行；db 真库测试耗时占比大
  4. 排查命令：`timeout 15 node --env-file=.env --test --test-timeout=8000 <glob>` 分段跑定位超时文件，再缩短该文件测试查找挂起点
- **并发数经验：默认 16 核全并发会 GC/锁抖动（全量从 ~9s 恶化到 >60s）——`npm test` 已固化为 `--test-concurrency=8`**；新增慢文件或机器变化后先验证此值仍成立（<15s 预算内）

### 7.1.1 测试范围（sql/redis 协议层只测三部分）

**db 协议层（`src/db/**/*.test.ts`）只测三部分，其它情况一律不测**：

1. **connection：连接 / 执行命令 / 断开** — `postgres/connection.test.ts`（连接/认证/简单查询/参数化/错误码/断开）、`redis/connection.test.ts`（连接/命令/重连/订阅/CLIENT KILL/超时）
2. **AST parse/stringify** — `redis/resp.test.ts` + `postgres/protocol.test.ts`（字节编解码 = parse/stringify 底层）、`src/test/redis-ast.test.ts`（RESP ⇄ RedisCommand）、`src/test/query-language.test.ts`（SQL ⇄ Query Language AST + compileQuery）
3. **其它不测** — 协议引擎特性（pool 语义/管道/pipeline/类型映射/事务隔离/statement_timeout/prepare cache/流式推送）、schema 层、MemorySql/MemoryRedis 实现细节——**一律删除或不再新增**（生产实现由业务测试间接覆盖）

**规则**：
- connection 测试连**进程内内存服务器**（`MemoryRedisServer`/`MemoryPostgresServer`——`src/db/test-servers.ts`）——真实 TCP 线协议交互（RESP/PG v3），零 docker
- 文件级内存服务器必须 `after(close)`（node --test 文件结束需事件循环清空——net server 不关 = 文件挂起）
- 新增 sql/redis 协议测试前先问：属于三部分哪一类？不属于 → 不写
- 业务测试（user/queue/messager/rate-limit/email mock）独立于上述范围——仍跑 MemorySql/MemoryRedis 与协议 mock

### 7.2 UI 组件测试纪律（jsdom + VNode 断言）

**官方测试原语 `weifuwu/ui-dom/testing`**（`src/ui-dom/testing.ts`）——禁止手抄
`renderVNode`/`mockCtx`（audit R-INFRA 强制；存量 LEGACY 表迁移中）：

```tsx
import { renderVNode, mountComponent, findByClass, findVNode, createTestCtx, createPopupMock } from '../../ui-dom/testing.ts'

// renderVNode：两阶段组件渲染到 VNode 层（**只一层**——子组件保留函数引用，断言 type 而非 DOM）
// mountComponent：**同实例 re-render**（内部 let 状态流转测试）——renderVNode 每次是新 mount，状态会丢
// findByClass：class token 精确匹配（split(' ')——includes 会误匹配 wf-a ⊃ wf-a-b）
// createTestCtx(overrides)：标准 ctx（render / ready + hooks mock）
// createPopupMock(isOpen)：usePopup 标准 mock（portal 按 isOpen 条件渲染）

// 无状态：const vnode = renderVNode(Button, { variant: 'primary' }, createTestCtx())
// 有状态（VNode 层）：const ctx = createTestCtx(); const vnode = renderVNode(Popover, { content: 'hello' }, ctx)
// 有状态（同实例，交互流转）：const render = mountComponent(Popover, {...}, ctx); render(); ...; render()
// 交互流转驱动：组件内部 let 状态在事件回调里变化 + render()——测试里触发事件后 await ctx.ui.render() 断言 DOM
```

- **renderVNode 只渲染一层**：子组件 VNode 的 `type` 是组件函数（断言 `=== Icon`），不是 `'svg'` 等标签名
- **DOM 事件级测试**（键盘/焦点/动画）：container 必须 `document.body.appendChild(container)`——jsdom 中未连接文档的元素 `.focus()` 无效（Tabs 方向键/DatePicker 导航踩过）
- **`dispatchEvent` 必须用 jsdom 的 Event**：`new (window as any).Event(...)`——node 原生 Event 与 jsdom EventTarget 不兼容，抛 `TypeError: parameter 1 is not of type 'Event'`
- **模拟真实 `ctx.ui.render()` 用 patchValue 而非 mountVNode**：签名 `patchValue(container, container.firstChild, prev, next, ctx)` 同树 patch（portal 正确增删）；mountVNode 全量重挂会残留 portal 脏节点
- **退场动画 = 延迟卸载**：`open=false` 后 DOM 仍在（播 `--exit` 动画），断言"关闭后 DOM 消失"须手动 `dispatchEvent(new (window as any).Event('animationend'))`
- **行为变更后旧测试可能静默挂起而非失败**（如 maskClosable 默认 false 后，旧测试点遮罩后 `await promise` 永不 resolve）——排查用 `--test-timeout=3000` 让挂起测试报超时，再二分定位
- **类型流测试**（`src/client/type-flow.test.ts`）：编译期断言（`@ts-expect-error` 负例）——props 泛型传错、未注入 ctx 字段必须编译期报错

### 7.3 DB 真库测试（CS-04）

**DB 客户端（redis/postgres）测试必须连 docker 真实库——禁止 mock 网络层**（`mock-server.ts` 已删除），故障注入用真实机制：

- Redis 断线/重连：`CLIENT KILL ID <id>`（杀真实连接）+ BLPOP 阻塞（制造确定性 pending）+ 未占用端口（不可达）
- PG 连接被杀：`pg_terminate_backend(pid)`（杀真实后端进程）
- redis: `localhost:6379`（`REDIS_URL`）；postgres: `localhost:5432`（`DATABASE_URL`，root/123456/demo）
- 新增能力时：真库测试必须覆盖协议正确性 + 故障恢复（重连/订阅重放/池重建）

## 8. 设计系统维护（layout/components）

`style-audit`（`src/test/style-audit.test.ts`，30 条规则）是设计约束的防护网——改 CSS/组件不得违反，违反即测试红：

### 动效语言（P0）
- 动效 Token：`--wf-dur-*`（时长阶梯）、`--wf-ease-*`（缓动曲线）、`--wf-motion-*`（位移量）——组件动效统一引用，禁止各自硬编码
- **浮层组件 `--enter`/`--exit` 类必须成对**（audit 强制）——exit 类定义了就必须挂上，退场死代码是 CS-01 违规（Modal/Drawer 曾只定义不挂）
- 退场实现模式：`animateOut(el, done, fallbackMs)`（`src/client/motion.ts`）——挂 exit 类 → animationend → 回调，兜底 timeout 防 animationend 丢失挂死；reduced-motion 下动画被 _base.css 降为 0.01ms，animationend 等效瞬时
- Modal/Drawer 退场状态机：`phase: closed|open|exit`，挂载期一次性监听 animationend（enter 结束忽略，exit 结束才 `ctx.ui.render()` 卸载）
- 命令式退场自适应：加类后查 `getComputedStyle().animationName`——真浏览器播动画，无 CSS 动画环境（jsdom）立即移除（Toast 模式）

### 语义色与对比度（P2）
- 语义文字色必须用 `-text` 变体（`--wf-color-success-text` 等 700 级），500 级仅限填充/边框/焦点——audit 强制
- 实心填充上的文字用 `--wf-color-on-brand`（禁裸 `#fff`）；遮罩用 `--wf-overlay`（禁裸 `rgba`）
- 新增色值由 audit 对比度计算测试把关（`-text` 对 `-50` 底 ≥ 4.5:1，亮暗双验证）
- **focus-ring 双层**（C5）：`--wf-focus-ring: 0 0 0 2px primary-bg, 0 0 0 1px primary`——系统暗色偏好下 primary-bg 变暗不可见，primary 是亮蓝（明暗主题聚焦均可见）；audit 强制 focus-ring 必须含 primary 线

### 图标（P3）
- 组件内禁裸文本字形（✕✓⚠▲▼⇅ 等）——统一 `Icon` 组件（`src/components/Icon/`，stroke SVG、currentColor、1em 随字号、aria-hidden）
- 文案性 emoji（labels）属白名单

### CJK 感知（P5）
- 表头/分组标题禁裸 `text-transform: uppercase`——必须 `var(--wf-heading-case)`（中文 no-op，audit 强制）
- 数值显示用 `wf-nums`（tabular-nums）防宽度抖动

### 键盘可达红线（P1）
- **可聚焦就必须可操作**：`role="button"`/`tabindex` 的元素必须有 Enter/Space 处理；方向键导航（Tabs/DatePicker）必须焦点跟随
- 浮层类（Modal/Drawer/Dropdown/Popover/Tooltip）Escape 关闭；Modal 系焦点 trap + 归还；Confirm 默认 `maskClosable=false`（危险操作防误触）

### 布局蓝本纪律（apps/layouts-demo，红线）
`apps/layouts-demo` 的每个布局模式是"复制即用"蓝本——**开发者抄的就是规范用法**，因此：
- **新功能先查框架**：实现任何能力前，先查 weifuwu/client（ctx.ui.* 原语）、weifuwu/layout（wf-* 原语）、weifuwu/components（组件）是否已提供——已提供优先用框架能力，绝不重复造轮子（如吸顶：页面级滚动用 Affix 组件，嵌套滚动容器用 wf-sticky 原语——都是框架能力，按场景选型而非自研）
- **加组件前先审布局/颜色**：向模式添加组件前，先用 agent-browser 审查当前页面布局（间距/对齐/层次/溢出/响应式）与颜色（对比度 ≥4.5:1、语义色一致性、亮暗双适配）是否合理——发现问题先修布局/颜色，再决定加组件（避免组件越加越多掩盖布局问题）
- **只使用 weifuwu/layout 原语（wf-* 类）与 weifuwu/components 组件**——布局结构用原语类，内容元素用组件，不自己写组件（裸 div/span 手搓结构），不自己写样式（内联 style / 自定义 CSS）
- 文本/间距/圆角/背景/边框等一律走原语：`wf-text-*`、`wf-p-*/wf-m-*/wf-gap-*`、`wf-rounded-*`、`wf-bg-*`、`wf-border-t/b`、`wf-surface`、`wf-scroll` 等
- 图标一律 `Icon` 组件（禁 emoji 装饰）；文本字形（✕✓ 等）禁裸写
- **能力缺口 → 补到 weifuwu/layout / weifuwu/components**（优化/修复/新增原语或组件），绝不绕过——布局蓝本暴露的缺口就是框架下一步该做的（如 Icon 业务图标缺失 → 扩充 Icon 到 78 个）
- 唯一允许的内联：CSS 变量注入（`--wf-cols`、`--wf-split-ratio`）与视口模拟容器（手机预览框 390×640 等"模拟视口"类尺寸）

## 9. 构建 & 发布

- `node scripts/build.mjs`（esbuild）
- `node scripts/release.mjs <version>`（构建 + 发布 + git tag）
- **发布跟随**：`package.json files` = `['dist/', 'README.md', 'docs/']`——`docs/` 随包发布（用户离线可查），`design/` **不发布**（内部设计/计划，仅仓库内）

## 10. 文档目录（docs/ vs design/）

| 目录 | 用途 | 读者 | 发布 |
|------|------|------|------|
| `docs/` | **用户文档**：README 按角色拆分——后端（server/data/realtime/saas）、前端（frontend/frontend-middleware/components/layout/styling/components-map/mobile）、通用（examples/environment） | 框架使用者 | ✅ 随 npm 包 |
| `design/` | **设计/计划文档**：阶段计划（components-*/db-clients-*/messager/scheduler/mobile-support）、协议契约（ai-contract）、设计系统（design-system-*/style-guide/token-layout）、指南（mobile/style-system） | 框架开发者/贡献者 | ❌ 仅仓库 |

**维护规则**：
- 新增用户可见能力 → 写 `docs/`（按角色对号入座），README 文档导航同步
- 新增 ctx.ui 原语 → 同步 `docs/custom-components.md`（自定义组件指南）+ `docs/frontend.md` 方法速查表
- 新增实现计划/架构决策 → 写 `design/`（参考各 `*-plan.md` 的格式）
- README 保持门面（~400 行）：简介/设计理念/快速开始/CDN/模块总览/核心概念 + 文档导航，不堆 API 细节
- 改协议/裁剪清单 → `design/ai-contract.md` / `design/db-clients-plan.md`（源码注释引用同步）

## 11. 路由匹配 & 自研协议层

### 路由匹配

- 后端 Router 使用 Trie 匹配，O(path_segments)
- 路径参数 `:id`，通配符 `*`
- `app.ws(path, handler)` WebSocket
- `app.graphql(handler)` GraphQL 端点

### 自研协议层开发原则（CS-05 细则）

weifuwu 的 DB 客户端（`src/db/redis/`、`src/db/postgres/`）与 schema 工具（`src/make-executable-schema.ts`）为自研实现，改动遵循：

**1. TDD 先行**
- 每个协议能力：**先写失败测试**（红）→ 最小实现（绿）→ 重构
- 测试用真实库（CS-04）验证协议行为——真实库能抓出文档外细节（如 SCRAM 格式、半双工缓冲、Describe 只回一次 T）

**2. 诚实裁剪（可预测失败）**
- **不支持的能力明确抛 `ProtocolError('unsupported')`**，绝不静默降级或"尽量支持"
- 已裁剪清单：逻辑复制/大对象/游标/二进制 COPY（PG）；集群/哨兵/自动管道（Redis）
- 新增裁剪项：在 `design/db-clients-plan.md` 裁剪声明中登记

**3. 协议语义优先（真实库验证过的坑，不可回归）**
- 错误响应是正常协议消息（`-ERR` → 连接保持，RespError 作为值）
- 扩展查询消息是半双工缓冲（Parse/Bind/Execute 需 Flush/Sync 才执行）
- Describe 只回一次 RowDescription——prepare 复用须缓存列信息
- socket 必须 `setNoDelay(true)`（禁用 Nagle，避免 loopback 40ms 惩罚）
- 类型映射：jsonb→object、int→number、boolean→bool（DataRow 按列 OID 转换）

**4. 性能基线**
- 自研客户端性能须与原版（postgres.js/ioredis，devDependencies）同一量级
- 回归对比：`node bench/db-bench.ts`（改动编解码/连接层后必跑）
- 编解码零拷贝：buffer + offset 指针，避免 concat 累积 O(n²)

**5. makeExecutableSchema**
- 核心：SDL + resolvers map → 字段 resolve 绑定（`buildSchema` + 遍历 `getFields`）
- 裁剪：类型合并/extends、指令绑定（graphql 原生无等价，不自行实现）
- 新能力先补 `src/make-executable-schema.test.ts`

---

## 附录 A：组件问题调试方法论（TreeSelect 排查沉淀，2026-08）

> 一次 TreeSelect「点服务下拉框关闭」排查：用户坚持看真实 HTML → 抓出弹层飞到左上角（0,0）→ debug 日志定位到 scroll 时序竞争读 0 rect。以下为可复用排查步骤。

### A.1 真实 HTML 优先于 text（agent-browser 测试铁律）

**agent-browser 验证任何组件/交互时，只查 `textContent` 会掩盖结构问题——必须看真实 DOM**（用户强制要求）：

```ts
// agent-browser eval：outerHTML 验证真实结构（ref 属性/定位/children 树/class/内联 style）
document.querySelector('.wf-xxx')?.outerHTML
// 内联 style 是坐标/显隐真凶：getAttribute('style') 暴露 fixed 定位与 display
document.querySelector('.wf-xxx')?.getAttribute('style')
```

真实 HTML 能抓出：ref 字符串属性（setProp 污染）、弹层定位异常（`top:4px left:0px width:0px` vs 锚点 768,306）、**内联 style 坐标全 0（`top:0 left:0 width:0`——下拉渲染在视口左上角不可见——textContent 显示正常但用户看不到）**、switcher--open 状态、children 树完整性、portal 是否在 `#__wf_portal`。

**验证清单（每次 agent-browser 测试必查）**：
1. `outerHTML`——结构/属性/class（不含 text 拼写问题）
2. `getAttribute('style')` 或内联 style——**定位/显隐**（text 完全看不到）
3. `getBoundingClientRect()`——**真实可见性**（width 0 / 视口外 = 不可见）
4. `closest('#__wf_portal')`——**弹层是否 portal**（§5.4 弹窗纪律）
5. `getComputedStyle`——**生效样式**（display:none 等）

> 实战：AutoComplete 输入'支付'后 textContent 正确显示'支付平台管理/支付平账系统'，但 HTML 暴露 `style="top:0px; left:0px; width:0px"`——下拉在视口左上角宽 0 不可见——正是用户'输入支付没下拉'的报告。**text 全对 ≠ 可见**。

### A.2 debug 日志组件（带前缀 console.log）

在关键回调加 `console.log('[xxx-debug]', 参数...)`，浏览器端 hook 捕获（页面加载后 hook 才能拿到运行期日志）：

```ts
// eval 里 hook console.log（只收 [xxx-debug] 前缀避免噪音）
window.__dbg = []; const ol = console.log
console.log = (...a) => { if (String(a[0]).includes('[xxx-debug]')) window.__dbg.push(a.join(' ')); ol(...a) }
// 触发交互后读：JSON.stringify(window.__dbg)
```

实战：`[ts-debug] getEl → trigger w:0 → compute rect: 0 0 w:0`——直接暴露 scroll 时序竞争。

**适用回调**：usePopupPosition 的 el/compute/panel、Tree 的 row onClick/toggleExpand/toggleSelect、组件 open/close 切换。

### A.3 真实点击 vs eval click（agent-browser）

- `agent-browser click <selector>` = 真实 CDP 鼠标点击（命中测试 + 完整事件序列）——**最接近用户**；覆盖元素会报 `covered by` 提示
- `element.click()`（eval）= JS 调用——绕过命中测试——覆盖元素时仍会触发——**可能掩盖命中问题**
- **两者都测**：真实点击验证用户路径；eval click 验证逻辑链路（事件绑定/冒泡）

### A.4 时序竞争排查（scroll/ref 间隙）

组件交互异常若「时好时坏」→ 大概率时序竞争：

- scroll/resize 全局监听（popup-tracker）在元素替换瞬间触发 → `getBoundingClientRect` 读 0 → 状态被覆盖
- **0 rect 防护**：refresh/定位读取时 `r.width===0 && r.height===0` 跳过（保留上一坐标）——已修复于 `usePopupPosition`
- ref 更新间隙：元素替换中旧引用 rect 为 0——getter 读 rect 前先判 0

### A.5 agent-browser 会话纪律

- **状态残留**：多轮 eval 后组件状态混乱（open/expanded 残留）——`reload` 清状态再测；每次验证从 reload 开始
- **错误捕获时机**：console.error hook 必须在页面加载**前**（`open` 时注入会被加载期错误绕过）——或用 `agent-browser console --level error` 抓加载期错误
- **验证用真实命令**：`open → wait networkidle → click → eval 断言`——每步独立命令，不叠加在一个 eval 里

### A.6 验证陷阱（本次踩过）

- **esbuild 中文 `\u` 转义**：`grep "服务" app.js` 得 0 不代表数据缺失——中文被转义为 `\u670d...`（搜英文/唯一标识符）
- **注释被 esbuild 删除**：用 `// MARKER` 验证缓存失效无效——marker 必须在字符串/数据结构里
- **服务器加载 dist vs src**：demo 组件走 src（tsconfig paths），但服务器框架（ui.js 编译器）走 `dist`——改框架代码必须 `build` 后重启才生效
- **同名字段不同含义**：dropdown 的 `style.width`（popup.width=0）vs `getBoundingClientRect().width`（含 padding/border=10）——定位异常时两者都要看
