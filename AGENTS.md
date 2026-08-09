# weifuwu — 开发者指南

> 本文档面向 weifuwu **框架开发者/贡献者**，描述架构约束、编码标准和内部机制。
> **框架使用者**请查阅 [README.md](./README.md) 了解设计理念和 API 用法。

---

## 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`, `ctx.user`/`ctx.auth`（userSystem）, `ctx.limit`（rateLimit）, `ctx.email`（email）, `ctx.queue`（queue）, `ctx.schedule`/`ctx.cron`/`ctx.cancelCron`（scheduler）, `ctx.ai`（ai：chat/stream/agent/approve）
- **状态驱动渲染** — `ctx.ui.$()` 深度 Proxy，赋值自动触发 VDOM patch
- **组件签名** — `(initProps, ctx) => (props) => VNode | null`
- **两阶段模型** — 外层函数 = mount（只一次），内层返回函数 = render（每次 dirty/props 变化）
- **VDOM 支持 innerHTML** — 直接用 `innerHTML` prop
- **ref 管理 DOM** — `ref={el => { if (el) init; else cleanup }}`

## 核心标准速查

| ID     | 规则                                             | 代码中的体现                              |
| ------ | ------------------------------------------------ | ----------------------------------------- |
| CS-01  | `throw`/`return` 后不留死代码                    | if-else 都需 return                       |
| CS-02  | Promise 必须 await 或 catch                      | 无 `.then()` 无 catch                     |
| CS-03  | Event listener 内用 `console.error` 不用 `throw` | `server.on('error', ...)`                 |
| CS-04  | **DB 客户端测试必须连 docker 真实库**           | 禁 mock 网络层（已删）；故障注入用 CLIENT KILL / pg_terminate_backend |
| CS-05  | **协议层改动：TDD 先行 + 诚实裁剪**             | 新能力先写测试（红→绿）；不支持能力抛 `ProtocolError('unsupported')` |
| CS-06  | **行为变更先查旧测试**：默认值/时序变更后，旧测试可能静默挂起而非失败 | `await promise` 永不 resolve = 挂起信号；`--test-timeout` 定位；挂起比失败难定位一个量级 |
| FS-01  | 组件 = `Component<P, C>`：`(initProps: P, ctx) => (props: P) => VNode` | 无 class/hook/this；P=props（JSX 自动推断），C=ctx 注入依赖 |
| FS-02  | 组件必须类型化：`Component<P, C>`，ctx 注入声明 C | 禁止 `_init: any`；`ctx.api` 等由 C 泛型编译期保证 |
| FS-03  | Proxy 驱动渲染                                   | `$.x = val` 而非 DOM 操作                 |
| FS-04  | 禁止 eval/new Function                           | 安全基线                                  |
| FS-05  | 前端无 npm 运行时依赖                            | client 包 import 无外部 dep               |
| PS-01  | 请求路径无同步 I/O                               | 无 readFileSync/execSync                  |

## 组件写法

### 无状态组件

```tsx
const Badge: Component<{ variant: 'primary' | 'muted' }> = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

### 有状态组件

```tsx
const Toggle: Component = (_init, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.on = false

  // ── render（每次 dirty/props 变化）──
  return (props) =>
    h('button', {
      onClick: () => $.on = !$.on
    }, $.on ? '开' : '关')
}
```

### 异步组件（asyncComponent 工厂）

> `async (ctx) => (initProps, ctx) => (props) => VNode` — 工厂层（async，只执行一次并缓存）做数据声明/代码分割，mount/render 保持同步。必须用 `asyncComponent()` 包装。

```tsx
const UserProfile = asyncComponent(async (ctx) => {
  // ── 工厂层：数据声明（异步只在工厂边界）──
  const user = await ctx.data.get(`/api/user/${ctx.params.id}`)

  return (initProps, ctx) => {
    // ── mount：客户端状态（hydration 后交互）──
    const $ = ctx.ui.$()
    $.liked = false

    return (props) =>
      h('div', {},
        user.name,                                    // 服务端状态（闭包，SSR 进 HTML）
        h('button', { onClick: () => $.liked = !$.liked }, $.liked ? '❤️' : '🤍'),
      )
  }
})
```

关键规则：
- 工厂**只执行一次**（WeakMap 缓存），数据经闭包注入组件
- 客户端首次渲染：未解析 → **占位**，resolve 后整树重渲染补全；服务端遍历器直接 await（SSR 无占位）
- 工厂拿 `ctx`（数据/路由参数），不拿 props
- 会变的数据：初始值 seed 自服务端数据（`$.count = data.count`），交互改 `$`
- 初始状态必须确定性（禁止 `window.innerWidth` 之类直接初始化 → mismatch）

### ctx.data — 数据管道（工厂层取数）

| API | 语义 |
|-----|------|
| `ctx.data.get(key, fetcher?)` | 缓存命中 → 直接返回；未命中 → 调 fetcher 并缓存；同 key 并发合并 |
| `ctx.data.set(key, value)` | 写缓存（如手动失效/预置） |
| `ctx.data.has(key)` | 是否存在缓存 |

- **key 约定即 URL**（`/api/posts/1`），天然唯一；key 必须包含数据维度（route params、userId）
- **三场景自动适配**：SSR（服务端真 fetch，结果序列化进 `__DATA__`）/ hydration（`window.__DATA__` 种子同步命中，不重跑请求）/ SPA（未命中触发 fetcher）
- **失效**：工厂缓存绑定页面上下文——路由导航/登录登出时 `clearAsyncComponentCache()` 自动失效，工厂以新 ctx 重新执行（数据 key 变化时拿新数据）
- **个性化数据不进 ctx.data**：SSR 会把工厂取数结果序列化给所有客户端，会话/用户相关数据会污染索引且泄露给他人——留在客户端 `$` + fetch

### uiSsr + weifuwu/dev — 路由级统一渲染（SPA/SSR 透明）

- **`uiSsr({ routes, bundle })`**（`src/ui/ssr-page.ts`）：GET 匹配共享路由 → 注入 `ctx.route.params` → await 组件工厂 → 完整 HTML + `__DATA__` + bundle；未匹配/非 GET → next()
- **共享路由**（`src/client/route-match.ts`）：`flattenRoutes/compilePath/matchRoute/extractParams` 纯函数，router 与 uiSsr 共用——**组件工厂读 `ctx.route.params`，两端同源**
- **`weifuwu/dev`**（`src/dev/index.ts`）：Node `registerHooks` + esbuild 同步编译 `.ts/.tsx`（JSX → `weifuwu/client`），服务端直接跑 `.tsx`——与 `ctx.ui.js` 前端动态编译对称，两端同一 JSX 运行时
- **体验原则**：SSR/hydration 对开发者零决策——routes 即声明，渲染是默认属性；组件只写业务（数据 `ctx.data.get`、交互 `$`）
- 诚实边界：渲染期确定性纪律（dev 检测）；`uiSsr` 默认模板可自定义 title/template

### ctx.ui.ssr — 服务端渲染（后端）

`ctx.ui.ssr(Comp, props, { data })` → HtmlSafe HTML 片段；`ctx.ui.ssrData(data)` → `__DATA__` 脚本：

```ts
const data = new Map()
const html = await ctx.ui.ssr(BlogPage, {}, { data })
return ctx.ui.html`<div id="root">${html}</div>${ctx.ui.ssrData(data)}`
```

- 遍历器：await 工厂（数据进 HTML）、事件/ref 剥离、文本转义、class/style 序列化、Fragment/Portal 内联
- 服务端 ctx shim：`$` dirty no-op、`ctx.data` 预取去重、`selfId` 请求级隔离
- **诚实裁剪**（CS-05）：渲染期非确定性（Date/Math.random/locale）会导致 SSR/hydration mismatch——dev 检测，文档红线；个性化数据不上 SSR
- 后续演进：hydration 游标模式（客户端 await 工厂 + 收养服务端 DOM）、流式渲染（工厂 await 点 = 流式边界）

### 核心规则

| 参数 | 作用域 | 说明 |
|------|--------|------|
| `initProps` | mount 阶段 | 组件首次渲染时的 props，用于初始化 |
| `props` | render 阶段 | 每次 dirty/props 变化时保持最新值的 props |

```tsx
// ✅ 正确：初始化用 initProps，渲染用 props
const Counter = (initProps, ctx) => {
  const $ = ctx.ui.$()
  $.count = initProps.initial ?? 0
  return (props) =>
    h('button', { onClick: () => $.count += props.step ?? 1 }, $.count)
}

// ❌ 错误：用 mount 时捕获的 props 渲染，值永远不更新
const Bad = (props, ctx) =>
  () => h('div', {}, props.label)  // props.label 不会随父组件更新
```

### 无 $ 状态组件

不需要 `ctx.ui.$()` 的组件：

```tsx
const Button = (_init, ctx) =>
  (props) => h('button', { class: props.variant }, props.children)
```

`$` 可选——只有需要触发 re-render 的状态才用 `$`。

## 内部状态管理

| 状态类型 | 存放位置 | 触发渲染 | 例子 |
|---------|---------|---------|------|
| 自动 UI 状态 | `$.xxx` | 赋值自动 | `$.show`, `$.count` |
| 手动 UI 状态 | 闭包变量 `let` | 需调 `render()` | `let count; render()` |
| 内部缓存（不触发渲染） | 闭包变量 `let` | 不触发 | `let el`, `let timerId` |
| DOM 引用 | 闭包变量 + ref | 不触发 | `let wrapEl; ref={e => wrapEl=e}` |

```tsx
const Popover = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.show = false
  let wrapEl: HTMLElement | undefined

  return (props) =>
    h('div', {
      ref: (el) => { if (el) wrapEl = el },
      onClick: () => $.show = !$.show
    })
}
```

## Render 机制

| API | 触发时机 | 渲染方式 | 作用域 | 使用场景 |
|------|---------|---------|--------|---------|
| `$.x = val` | 赋值后自动 | 微任务批量（异步） | 当前组件 | **日常 UI 状态** — 表单输入、切换开关、异步数据加载等 |
| `ctx.ui.dirty()` | 主动调用 | 微任务批量（异步） | 当前/指定 | **绕过 Proxy 后手动标记** |
| `ctx.ui.render()` | 主动调用 | 立即同步 | 当前/指定 | **需要立即拿到最新 DOM** — DOM 测量、动画触发 |
| `ctx.ui.render(['id'])` | 主动调用 | 立即同步 | 指定组件 | **跨组件精准刷新** — 全局事件、兄弟组件协调 |
| `ctx.ui.useMedia()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **响应式媒体查询** — 断点变化时自动 dirty |
| `ctx.ui.useBreakpoint()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **命名断点** — mobile/tablet/desktop 自动 dirty |
| `ctx.ui.usePopupPosition()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **弹层坐标跟随** — scroll/resize 时自动重算 fixed 坐标 |
| `ctx.ui.useInView()` | 注册监听 | IO 合成器线程评估 | 当前组件 | **可见性观察**（IntersectionObserver 封装）— 替代组件自建 scroll 监听（Affix/BackTop/InView 统一使用）；`isIn` 响应式变化自动 dirty；rootMargin/threshold 支持函数动态读 props |
| `ctx.ui.useScrollPosition()` | 注册监听 | 全局 scroll + rAF 节流 | 当前组件 | **滚动位置跟踪** — `y` 响应式（视口/内部容器通用）；scroll handler 无布局访问（无 scroll-linked 警告）；Affix（阈值固定）/ VirtualList（虚拟窗口）使用 |
| `ctx.ui.useChat()` | 事件驱动 | 流式事件 → `$` 赋值 | 当前组件 | **AI 对话会话** — 消息累积/工具调用内嵌/HITL 审批/stop/retry（协议对页面透明，见 design/ai-contract.md） |

`render()` 无参 = 当前组件，传参 = 指定组件列表。三个入口同一套 scope 机制。

## 最佳实践：手动 vs 自动

weifuwu 是唯一一个手动/自动同层共存的框架。推荐按角色分层：

```
手动组件（components）                 自动业务层（app）
                              ┌──────────────────────┐
                              │  OrderPage           │
                              │  $.orders = data     │ ← $ 自动
                              │  $.loading = true    │
                              └──────┬───────────────┘
                                     │ props 传递
                                     ↓
┌─────────────────────────────────────────────┐
│  Table（手动）                               │
│  let sortKey / ctx.ui.render()              │ ← props 变化驱动
│  return (props) => h('table', ...)          │ ← 内部 UI 状态手动
│    └─ Badge（无状态，只用 props）              │
│         return (props) => h('span', ...)    │
└─────────────────────────────────────────────┘
```

### 组件库：手动优先

```tsx
// ✅ 组件库中用 let + render()，行为可预测
const DatePicker = (_init, ctx) => {
  let show = false
  let selectedValue = ''
  return (props) =>
    h('input', {
      onClick: () => { show = true; ctx.ui.render() }
    })
}
```

- **let 赋值不触发渲染**——组件行为只由 `render()` 显式控制
- **不依赖 `$`**——纯函数 + 闭包，测试中 `render()` 直接 mock 为空
- **测试简单**——VNode 断言，不需要关心渲染管线

### 业务层：自动优先

```tsx
// ✅ 业务代码中用 $，少写样板、不易遗漏
const OrderPage = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.orders = []
  $.loading = false
  $.activeTab = 'all'

  return (props) =>
    h('div', {},
      $.loading ? h(Spinner) : h(OrderList, { orders: $.orders }),
    )
}
```

- **省事**——`$.orders = data` 自动触发渲染
- **安全**——不会忘记调 `render()`
- **精准**——`$` 绑定所属组件，不波及兄弟

### 灵活混用

同一个组件里可以按变量选模式：

```tsx
const Panel = (_init, ctx) => {
  const $ = ctx.ui.$()
  let cached: Data[]       // 手动：不触发渲染
  $.visible = true         // 自动：频繁变化

  return (props) =>
    h('button', {
      onClick: async () => {
        cached = await fetch('/api/data')
        ctx.ui.render()    // 手动：数据回来后统一刷新
      }
    })
}
```

### `ctx.ui.selfId()` — 跨组件精准刷新

用于全局事件通知、Portal 远程控制、兄弟组件协调等场景：

```tsx
// 组件 A 注册自定义 ID
const StatsPanel = (_init, ctx) => {
  ctx.ui.selfId('stats')
  const $ = ctx.ui.$()
  $.data = []
  return (props) => h('div', {}, ...)
}

// 组件 B（或其他地方）用 ID 精准刷新
ctx.ui.render(['stats'])
// 或：ctx.ui.dirty(['stats']) 异步批处理版本
```

同名冲突抛错，每个自定义 ID 必须全局唯一。

### 选择指南

```
需要渲染                       不需要渲染
─────────────────              ─────────────────
$.xxx = val（自动）            let x = val（手动）
ctx.ui.render()（手动）        
ctx.ui.render(['id'])（跨组件）
```

### `$` Proxy 行为

`ctx.ui.$()` 返回深度 Proxy，由 `createReactiveState()` 创建：
- **selfId 错位陷阱**（JSONViewer 折叠失效根因）：`$` 的 dirty 回调在 **mount 时捕获 selfId**——组件在
  无状态包裹/重挂载场景（VNode 重挂载但 `_render` 复用）下，捕获的 selfId 与当前实例错位 →
  dirty 渲染孤儿实例，**交互静默失效**（无 console 错误）。症状：`$` 赋值后 DOM 不更新。
  修复模式（JSONViewer 采用）：**render 期捕获当前 selfId + 显式精准 dirty**：
  ```ts
  return (props) => {
    const selfId = (ctx.ui as any)._selfId
    const set = (k, v) => { $.x = v; if (selfId) ctx.ui.dirty([selfId]) }
    ...
  }
  ```
  jsdom 单测（mock `$` 为纯对象）无法暴露此缺陷——**必须 agent-browser 实测交互**。

- `$.x = val` → `set` trap → `dirty()`（微任务合并）
- `$.obj.a = 1` → 递归 Proxy 包装 → `set` trap
- `$.arr.push(val)` → 内部 `[[Set]]` → `set` trap
- `delete $.x` → `deleteProperty` trap
- 每个组件实例独立 Proxy，WeakMap 缓存复用

### `$.__watch(cb)` — 多消费者订阅（共享 $ 的子组件）

`$` 默认只通知创建者（dirty → 当前组件）。当**同一响应式状态被多个组件共享**时（典型：父组件把 `ctx.ui.useChat()` 的 handle 作为 prop 传给子组件，如 `<AiChat chat={$} />`），父组件 dirty 不会驱动子组件重渲染（三态 skip：props 引用恒等 + 子组件自身未脏）。子组件在 mount 阶段自订阅：

```tsx
const AiChat = (initProps, ctx) => {
  const unwatch = initProps.chat.__watch?.(() => ctx.ui.dirty())
  // 任何会话状态变化 → dirty 自身 → 重渲染
  return (props) => h('div', {
    ref: (el) => { if (!el) unwatch?.() },  // 真正卸载时退订（见 ref 纪律）
  })
}
```

- 订阅在 mount 阶段注册；任何 `$.x = val`（含深层赋值/数组变异）都会通知**所有**订阅者
- 返回退订函数；**退订必须放在真正的卸载路径**（见下方 ref 纪律——内联 ref 会导致每次渲染误退订）
- 应用场景：共享 `$`/handle 的展示组件（AiChat）、跨组件观察同一状态、副作用跟踪
- SSR 无害：`ctx.ui.$()` 的 shim 同样返回带 `__watch` 的容器，无订阅者即无副作用

### `ctx.ui.dirty()` — 手动标记脏

绕过 Proxy 直接操作底层数据后标记重渲染。实际生产中极少需要——深度 Proxy 已拦截几乎所有变异操作。

### `ctx.ui.render()` — 同步强制渲染

与 `dirty()` 的微任务批量不同，`render()` 同步执行 VDOM diff + patch。用于 DOM 测量、动画、第三方库同步读取等场景。

### `ctx.ui.selfId()` — 自定义组件 ID

用于跨组件精准刷新。在 mount 阶段注册，同名直接抛错：

```tsx
const StatsPanel = (_init, ctx) => {
  ctx.ui.selfId('stats')  // 注册语义化 ID
  // ...
}
// 其他地方：ctx.ui.render(['stats'])
```

注册后可通过 `ctx.ui.render(['id'])`、`ctx.ui.dirty(['id'])` 精准定位组件，绕过多层 props 传递。

## ref 管理第三方库

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

### ref 纪律：带清理逻辑的 ref 必须定义在 mount 作用域

weifuwu 的 ref-diff 在 **ref 函数引用变化时**调用旧 ref(null)（render.ts patch 逻辑）。若 ref 内联写在 render 里，每次重渲染都是新函数 → 旧 ref(null) 被调用 → null 分支的清理逻辑（退订 / removeEventListener / dispose）会在**每次渲染后**触发，而非仅在卸载时。

```tsx
// ❌ 内联 ref：每次渲染引用变化 → null 分支被反复触发（AiChat 流式不更新的根因之一）
return (props) =>
  h('div', { ref: (el) => { if (el) init(); else cleanup() } })

// ✅ 稳定 ref：定义在 mount 作用域，ref(null) 只在真正卸载时调用
const listRef = (el: any) => { if (el) init(); else cleanup() }
return (props) => h('div', { ref: listRef })
```

## $ Proxy 实现要点

- `createReactiveState(dirty)` → 递归 Proxy + WeakMap 缓存
- `__watch` 多消费者订阅：set/deleteProperty trap 在 `dirty()` 后通知 `watchers` 集合（每个 createReactiveState 实例一个集合）；`__watch` 以非枚举属性挂在根 Proxy 上
- mount/render 阶段 `$.x = val` 不触发渲染（`dirty` 在 `_rendering` 保护期内调用被忽略）
- 仅事件/timer/Promise.then 中的赋值生效

### 受控组件纪律：受控 props 必须配回调（缺回调 = 静默不可点）

受控组件（`active`/`value`/`checkedKeys`/`month`/`open` 等传入时）状态由父组件独占，点击/选择的**唯一出口是回调**。缺回调时交互**静默失效**——真实操作抓出 6 个同款 demo bug（Collapse/Tree/Calendar/Cascader/Dropdown）：

- **组件**：受控 props 已传但无回调时 `console.warn` 明确提示（Collapse/Tree/Calendar/Cascader/Dropdown 已有防护）
- **新受控组件**必须自带同款 warn（防静默不可用）
- 非受控（不传受控 props）即可点击——**demo 要展示可交互用法**（受控配回调或非受控）

### 浏览器环境纪律：内置组件禁止直接访问 DOM 全局

**内置组件使用浏览器能力必须经 `ctx.browser`（环境 API）与 `ctx.ui.useXXX`（框架原语）——禁止直接 `window.`/`document.`/`navigator.`/`localStorage`/`matchMedia(`/`IntersectionObserver` 等 DOM 全局**（组件侧已清零，46 处迁移完毕）：

```tsx
const MyComp: Component = (_init, ctx) => {
  // ctx.browser 优先，测试/无注入环境 fallback jsdom
  const browser = ctx.browser ?? createClientBrowser()
  return (props) =>
    h('button', {
      onClick: () => {
        void browser.copyText('hello')          // 复制（勿自建 textarea+execCommand）
        const el = browser.byId('target')        // 查询
        const y = browser.scrollTop()             // 滚动量（scrollingElement 优先）
        browser.storageSet('k', 'v')             // 存储（SSR/隐私模式安全）
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

### 弹窗组件纪律：浮层必须 portal 渲染（统一弹窗管理）

**所有脱离文档流的浮层（dropdown/select/datepicker/menubar/cascader/mentions/contextmenu/tooltip/popover/hovercard/modal/drawer/toast/notification/confirm/tour/command 等）必须 `createPortal` 渲染到 `#__wf_portal`（body）——禁止 `position: absolute` 相对父容器**（18 个组件已合规；TreeSelect 曾遗漏，absolute 方案在父容器 overflow:hidden/transform/z-index 上下文下裁剪/错位）：

```tsx
// ✅ portal：渲染到 body——z-index/Escape/夹紧/跟随统一管理
const dropdown = open ? createPortal(h('div', { class: 'wf-xxx-dropdown', style: { position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px` } }, menu), 'xxx-dropdown') : null
```

**统一管理的能力**（portal 收敛后才可能）：

| 能力 | 机制 |
|------|------|
| 层级 | z-index token 阶梯（`--wf-z-popover/toast/tooltip/modal/tour`）——全 body 同一上下文裁决 |
| 定位 | `usePopupPosition`（触发元素 rect → fixed 坐标 + 视口夹紧 + scroll/resize 跟随） |
| 关闭 | Escape 全局（`useGlobalKey`）/ 外部点击（usePopup） |
| 动画 | 退场 `--exit` 类 + `animateOut`（porta→延迟卸载） |
| 管理 | portalKey 唯一（`'modal'`/`'dropdown'`/`'treeselect'`…——同 key 互斥渲染） |

**硬性规则**：
- 浮层根元素必须 `position: fixed` + JS 坐标（禁止 absolute 定位 + CSS 坐标）
- 定位必须经 `usePopupPosition`（rect 跟随 + 视口夹紧）——打开时 `refresh()`
- portalKey 语义化（组件名）——同组件多个弹层需区分
- 弹层容器必须 `z-index: var(--wf-z-*)`（禁裸值，audit 强制）
- **测试注意**：portal vnode 的 `type` 是 Portal 组件（非字符串标签）——断言子内容用 `vnode.props.children` 递归

### 样式纪律：小尺寸 button 必须固定 min/max-height

全局 button 样式设 `min-height: 36px`——**任何小尺寸按钮**（checkbox/dot/switcher/star/关闭钮等）若不覆盖，会被撑成 36px 竖条（Tree checkbox 14x36、Carousel 圆点 8x45、Rate 星 16x36——真实操作抓出 6 处）：

```css
.wf-xxx-btn {
  width: 14px; height: 14px;
  min-width: 14px; max-width: 14px;
  min-height: 14px; max-height: 14px;
  line-height: 0; padding: 0; flex-shrink: 0;
}
```


## 测试

- `node --test` 无 Jest/Mocha
- **bash 命令 timeout 原则**：运行测试/脚本的 `bash` 命令必须设 `timeout`（**≤15 秒**），并优先加 `--test-timeout`（如 `timeout 15 node --env-file=.env --test --test-timeout=8000 ...`）——真库/集成测试卡住时能快速定位而非无限等待；卡住时用更短 timeout 复跑缩小范围

## 组件问题调试方法论（TreeSelect 排查沉淀，2026-08）

> 一次 TreeSelect「点服务下拉框关闭」排查：用户坚持看真实 HTML → 抓出弹层飞到左上角（0,0）→ debug 日志定位到 scroll 时序竞争读 0 rect。以下为可复用排查步骤。

### 1. 真实 HTML 优先于 text（agent-browser 测试铁律）

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
4. `closest('#__wf_portal')`——**弹层是否 portal**（AGENTS.md 弹窗纪律）
5. `getComputedStyle`——**生效样式**（display:none 等）

> 实战：AutoComplete 输入'支付'后 textContent 正确显示'支付平台管理/支付平账系统'，
> 但 HTML 暴露 `style="top:0px; left:0px; width:0px"`——下拉在视口左上角宽 0 不可见——
> 正是用户'输入支付没下拉'的报告。text 全对 ≠ 可见。

### 2. debug 日志组件（带前缀 console.log）

在关键回调加 `console.log('[xxx-debug]', 参数...)`，浏览器端 hook 捕获（页面加载后 hook 才能拿到运行期日志）：

```ts
// eval 里 hook console.log（只收 [xxx-debug] 前缀避免噪音）
window.__dbg = []; const ol = console.log
console.log = (...a) => { if (String(a[0]).includes('[xxx-debug]')) window.__dbg.push(a.join(' ')); ol(...a) }
// 触发交互后读：JSON.stringify(window.__dbg)
```

实战：`[ts-debug] getEl → trigger w:0 → compute rect: 0 0 w:0`——直接暴露 scroll 时序竞争。

**适用回调**：usePopupPosition 的 el/compute/panel、Tree 的 row onClick/toggleExpand/toggleSelect、组件 open/close 切换。

### 3. 真实点击 vs eval click（agent-browser）

- `agent-browser click <selector>` = 真实 CDP 鼠标点击（命中测试 + 完整事件序列）——**最接近用户**；覆盖元素会报 `covered by` 提示
- `element.click()`（eval）= JS 调用——绕过命中测试——覆盖元素时仍会触发——**可能掩盖命中问题**
- **两者都测**：真实点击验证用户路径；eval click 验证逻辑链路（事件绑定/冒泡）

### 4. 时序竞争排查（scroll/ref 间隙）

组件交互异常若「时好时坏」→ 大概率时序竞争：

- scroll/resize 全局监听（popup-tracker）在元素替换瞬间触发 → `getBoundingClientRect` 读 0 → 状态被覆盖
- **0 rect 防护**：refresh/定位读取时 `r.width===0 && r.height===0` 跳过（保留上一坐标）——已修复于 `usePopupPosition`
- ref 更新间隙：元素替换中旧引用 rect 为 0——getter 读 rect 前先判 0

### 5. agent-browser 会话纪律

- **状态残留**：多轮 eval 后组件状态混乱（open/expanded 残留）——`reload` 清状态再测；每次验证从 reload 开始
- **错误捕获时机**：console.error hook 必须在页面加载**前**（`open` 时注入会被加载期错误绕过）——或用 `agent-browser console --level error` 抓加载期错误
- **验证用真实命令**：`open → wait networkidle → click → eval 断言`——每步独立命令，不叠加在一个 eval 里

### 6. 验证陷阱（本次踩过）

- **esbuild 中文 `\u` 转义**：`grep "服务" app.js` 得 0 不代表数据缺失——中文被转义为 `\u670d...`（搜英文/唯一标识符）
- **注释被 esbuild 删除**：用 `// MARKER` 验证缓存失效无效——marker 必须在字符串/数据结构里
- **服务器加载 dist vs src**：demo 组件走 src（tsconfig paths），但服务器框架（ui.js 编译器）走 `dist`——改框架代码必须 `build` 后重启才生效
- **同名字段不同含义**：dropdown 的 `style.width`（popup.width=0）vs `getBoundingClientRect().width`（含 padding/border=10）——定位异常时两者都要看
- **全量测试总时长预算：≤ 15 秒**（`npm test` = pretest docker 1.6s + 测试本体 ~9.4s + npm 启动开销 ≈ **11s 实测**；1466 测试含 db 真库 191 个）。**超过 15 秒 = 必须排查的告警**，按序检查：
  1. **资源未释放**：db 连接未 `close()`（连接池堆积）、redis 订阅未退订（Pub/Sub 残留）、jsdom 定时器未清（setTimeout/interval 未 clear——挂起比失败更难定位）、全局 document/mutation 监听未 remove、async 工厂/WeakMap 缓存异常增长
  2. **新增测试自身慢**：长按/动画测试的 sleep（`usePopup` longpress 500ms×2 是已知最慢项）；改为事件驱动断言或用更短可配置时长
  3. **串行瓶颈**：`--test-concurrency=1` 文件串行 + 每个测试文件的 setup/teardown 开销；db 真库测试耗时占比大（191 测试 4.3s）
  4. 排查命令：`timeout 15 node --env-file=.env --test --test-timeout=8000 <glob>` 分段跑定位超时文件，再缩短该文件测试查找挂起点
- **并发数经验：默认 16 核全并发会 GC/锁抖动（全量从 ~9s 恶化到 >60s）——`npm test` 已固化为 `--test-concurrency=8`（实测稳定 ~11.5s）**；新增慢文件或机器变化后先验证此值仍成立（<15s 预算内）
- **CS-04 — DB 客户端（redis/postgres）测试必须连 docker 真实库**：
  - **禁止 mock 网络层**（`mock-server.ts` 已删除）——故障注入用真实机制：
    - Redis 断线/重连：`CLIENT KILL ID <id>`（杀真实连接）+ BLPOP 阻塞（制造确定性 pending）+ 未占用端口（不可达）
    - PG 连接被杀：`pg_terminate_backend(pid)`（杀真实后端进程）
  - redis: `localhost:6379`（`REDIS_URL`）；postgres: `localhost:5432`（`DATABASE_URL`，root/123456/demo）
  - 新增能力时：真库测试必须覆盖协议正确性 + 故障恢复（重连/订阅重放/池重建）
  - 测试命令 `npm test` 的 pretest 已自动 `docker compose up -d`
- 组件测试：调用 `renderVNode(Comp, props, ctx)` 获取 VNode
- **类型流测试**（`src/client/type-flow.test.ts`）：编译期断言（`@ts-expect-error` 负例）——props 泛型传错、未注入 ctx 字段必须编译期报错

```tsx
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

// 无状态组件
const vnode = renderVNode(Button, { variant: 'primary' }, mockCtx)

// 有状态组件
const ctx = mockCtx()
const vnode = renderVNode(Popover, { content: 'hello' }, ctx)
const $ = ctx.ui.$()
$.show = true
const vnode2 = renderVNode(Popover, { content: 'hello' }, ctx)
```

## 客户端模块状态共享（重要）

`weifuwu/client` 与 `weifuwu/components` **必须共享同一模块实例**（`idRegistry`/`_idCounter`/`_dirtyBatch` 等状态只在 client 模块内存在一份）：

- **症状**：命令式中间件（`toast()` 等）挂载的组件注册在 components 自己的 idRegistry，但 `$` 的 dirty 走 app 的 `renderByIds`（查 app 的 registry）→ 命中无关组件/漏渲染——真实 app 实测：toast 永不渲染，单测全绿（node --test 单模块图掩盖）
- **两道防线**：① `scripts/build.mjs` 组件构建外部化 `src/client/*` 导入 → `weifuwu/client`（dist 消费端共享）；② **app 的 tsconfig `paths` 必须同时映射 `weifuwu/client` 和 `weifuwu/components` 到 src**（dev 全 src 单图）——只映射 client 不映射 components 时，app 用 src 的 client、components 用 dist 的 client，状态仍重复
- 排查手段：浏览器探针 + 检查 bundle 内 `var _idCounter` 出现次数（>1 = 状态重复）；esbuild metafile 看 `src/client` 与 `dist/client` 是否同时被引用

### 渲染器已知坑：enumerated 属性必须显式字符串（draggable 踩过）

`setProp`/`patchProps` 对 `value === true` 用 `setAttribute(key, '')`——适用于 boolean
属性（disabled/hidden），但 **enumerated 属性（draggable 等）空字符串解析为 false**——
`<div draggable />` 实际 `el.draggable === false` → 拖动变成文本选中（Kanban 真实 bug）：

- render.ts/diff.ts 对 `draggable` 显式 `setAttribute('draggable', value ? 'true' : 'false')`
- 新 enumerated 属性（contenteditable 等）同理——**空字符串语义需查 HTML 规范**
- 防线：`src/test/client/draggable.test.ts`（el.draggable 真值断言——jsdom 可测）

### ref 触发时机（focus-trap 踩过）

weifuwu 的 ref 在元素 **appendChild 之前**触发（renderValue 先渲染子节点再调 ref，父层最后 append）——此时元素未连接文档，`el.focus()` 在 Chrome 无效。trapFocus 的初始聚焦用 `queueMicrotask` 延迟到挂载完成后。其他依赖连接态的 ref 初始化同理。

### UI 组件测试纪律（jsdom + VNode 断言）

- **renderVNode 只渲染一层**：子组件 VNode 的 `type` 是组件函数（断言 `=== Icon`），不是 `'svg'` 等标签名
- **DOM 事件级测试**（键盘/焦点/动画）：container 必须 `document.body.appendChild(container)`——jsdom 中未连接文档的元素 `.focus()` 无效，`document.activeElement` 不更新（Tabs 方向键/DatePicker 导航踩过）
- **`dispatchEvent` 必须用 jsdom 的 Event**：`new (window as any).Event(...)`——node 原生 Event 与 jsdom EventTarget 不兼容，会抛 `TypeError: parameter 1 is not of type 'Event'`
- **模拟真实 `ctx.ui.render()` 用 patchValue 而非 mountVNode**：签名 `patchValue(container, container.firstChild, prev, next, ctx)` 同树 patch（portal 正确增删）；mountVNode 全量重挂会残留 portal 脏节点
- **退场动画 = 延迟卸载**：`open=false` 后 DOM 仍在（播 `--exit` 动画），断言"关闭后 DOM 消失"须手动 `dispatchEvent(new (window as any).Event('animationend'))`
- **行为变更后旧测试可能静默挂起而非失败**（如 maskClosable 默认 false 后，旧测试点遮罩后 `await promise` 永不 resolve）——挂起比失败难定位一个量级，且会让整个测试文件拖住；排查用 `--test-timeout=3000` 让挂起测试报超时，再二分定位

## 设计系统维护（layout/components）

P8 后 `style-audit`（`src/test/style-audit.test.ts`，16 条规则）是设计约束的防护网——改 CSS/组件不得违反，违反即测试红：

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

### 图标（P3）
- 组件内禁裸文本字形（✕✓⚠▲▼⇅ 等）——统一 `Icon` 组件（`src/components/Icon/`，stroke SVG、currentColor、1em 随字号、aria-hidden）
- 文案性 emoji（labels）属白名单

### CJK 感知（P5）
- 表头/分组标题禁裸 `text-transform: uppercase`——必须 `var(--wf-heading-case)`（中文 no-op，audit 强制）
- 数值显示用 `wf-nums`（tabular-nums）防宽度抖动

### 键盘可达红线（P1）
- **可聚焦就必须可操作**：`role="button"`/`tabindex` 的元素必须有 Enter/Space 处理；方向键导航（Tabs/DatePicker）必须焦点跟随
- 浮层类（Modal/Drawer/Dropdown/Popover/Tooltip）Escape 关闭；Modal 系焦点 trap + 归还；Confirm 默认 `maskClosable=false`（危险操作防误触）

## 构建 & 发布

- `node scripts/build.mjs`（esbuild）
- `node scripts/release.mjs <version>`（构建 + 发布 + git tag）
- `npm test` — 运行 `node --test`
- 测试前执行 `docker compose up -d postgres redis`
- **发布跟随**：`package.json files` = `['dist/', 'README.md', 'docs/']`——`docs/` 随包发布（用户离线可查），`design/` **不发布**（内部设计/计划，仅仓库内）

## 文档目录（docs/ vs design/）

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

## 路由匹配

- 后端 Router 使用 Trie 匹配，O(path_segments)
- 路径参数 `:id`，通配符 `*`
- `app.ws(path, handler)` WebSocket
- `app.graphql(handler)` GraphQL 端点

## 自研协议层开发原则（CS-05 细则）

weifuwu 的 DB 客户端（`src/db/redis/`、`src/db/postgres/`）与 schema 工具（`src/make-executable-schema.ts`）为自研实现，改动遵循：

### 1. TDD 先行
- 每个协议能力：**先写失败测试**（红）→ 最小实现（绿）→ 重构
- 测试用真实库（CS-04）验证协议行为——真实库能抓出文档外细节（如 SCRAM 格式、半双工缓冲、Describe 只回一次 T）

### 2. 诚实裁剪（可预测失败）
- **不支持的能力明确抛 `ProtocolError('unsupported')`**，绝不静默降级或"尽量支持"
- 已裁剪清单：逻辑复制/大对象/游标/二进制 COPY（PG）；集群/哨兵/自动管道（Redis）
- 新增裁剪项：在 `design/db-clients-plan.md` 裁剪声明中登记

### 3. 协议语义优先（真实库验证过的坑，不可回归）
- 错误响应是正常协议消息（`-ERR` → 连接保持，RespError 作为值）
- 扩展查询消息是半双工缓冲（Parse/Bind/Execute 需 Flush/Sync 才执行）
- Describe 只回一次 RowDescription——prepare 复用须缓存列信息
- socket 必须 `setNoDelay(true)`（禁用 Nagle，避免 loopback 40ms 惩罚）
- 类型映射：jsonb→object、int→number、boolean→bool（DataRow 按列 OID 转换）

### 4. 性能基线
- 自研客户端性能须与原版（postgres.js/ioredis，devDependencies）同一量级
- 回归对比：`node bench/db-bench.ts`（改动编解码/连接层后必跑）
- 编解码零拷贝：buffer + offset 指针，避免 concat 累积 O(n²)

### 5. makeExecutableSchema
- 核心：SDL + resolvers map → 字段 resolve 绑定（`buildSchema` + 遍历 `getFields`）
- 裁剪：类型合并/extends、指令绑定（graphql 原生无等价，不自行实现）
- 新能力先补 `src/make-executable-schema.test.ts`
