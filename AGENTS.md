# weifuwu — 开发者指南

> 本文档面向 weifuwu **框架开发者/贡献者**，描述架构约束、编码标准和内部机制。
> **框架使用者**请查阅 [README.md](./README.md) 了解设计理念和 API 用法。

---

## 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`
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
| FS-01  | 组件 = `(initProps, ctx) => (props) => VNode`    | 无 class/hook/this                        |
| FS-03  | Proxy 驱动渲染                                   | `$.x = val` 而非 DOM 操作                 |
| FS-04  | 禁止 eval/new Function                           | 安全基线                                  |
| FS-05  | 前端无 npm 运行时依赖                            | client 包 import 无外部 dep               |
| PS-01  | 请求路径无同步 I/O                               | 无 readFileSync/execSync                  |

## 组件写法

### 无状态组件

```tsx
const Badge: Component = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

### 有状态组件

```tsx
const Toggle = (_init, ctx) => {
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

### 异步组件

```tsx
const UserProfile = async (initProps, ctx) => {
  const $ = ctx.ui.$()
  $.loading = true

  const user = await fetch(`/api/user/${initProps.id}`).then(r => r.json())

  $.loading = false
  $.user = user

  return (props) =>
    $.loading
      ? h('div', {}, 'Loading...')
      : h('div', {}, $.user.name)
}
```

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

- `$.x = val` → `set` trap → `dirty()`（微任务合并）
- `$.obj.a = 1` → 递归 Proxy 包装 → `set` trap
- `$.arr.push(val)` → 内部 `[[Set]]` → `set` trap
- `delete $.x` → `deleteProperty` trap
- 每个组件实例独立 Proxy，WeakMap 缓存复用

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

## $ Proxy 实现要点

- `createReactiveState(dirty)` → 递归 Proxy + WeakMap 缓存
- mount/render 阶段 `$.x = val` 不触发渲染（`dirty` 在 `_rendering` 保护期内调用被忽略）
- 仅事件/timer/Promise.then 中的赋值生效

## 测试

- `node --test` 无 Jest/Mocha
- 组件测试：调用 `renderVNode(Comp, props, ctx)` 获取 VNode

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

## 构建 & 发布

- `node scripts/build.mjs`（esbuild）
- `node scripts/release.mjs <version>`（构建 + 发布 + git tag）
- `npm test` — 运行 `node --test`
- 测试前执行 `docker compose up -d postgres redis`

## 路由匹配

- 后端 Router 使用 Trie 匹配，O(path_segments)
- 路径参数 `:id`，通配符 `*`
- `app.ws(path, handler)` WebSocket
- `app.graphql(handler)` GraphQL 端点
