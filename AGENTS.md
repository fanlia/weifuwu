# weifuwu — 架构约束与编码标准

全栈框架：后端 `(req, ctx) => Response` + 前端 `(initProps, ctx) => (props) => VNode` + 纯 CSS 布局。

## 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`
- **状态驱动渲染** — `ctx.ui.$` 深度 Proxy，赋值自动触发 VDOM patch
- **组件签名** — `(initProps, ctx) => (props) => VNode | null`
- **两阶段模型** — 外层函数 = mount（只一次），内层返回函数 = render（每次 dirty/props 变化）
- **生命周期** — `ctx.ui.onmount/onunmount/onupdate`
- **VDOM 支持 innerHTML** — 直接用 `innerHTML` prop
- **ref 管理第三方库** — `ref={el => { init; return () => cleanup }}`

## 组件写法

### 无状态组件

```tsx
const Badge = (_init, ctx) =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

### 有状态组件

```tsx
const Toggle = (_init, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  $.on = false

  ctx.ui.onunmount(() => cleanup())

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
  const $ = ctx.ui.$
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
  const $ = ctx.ui.$
  $.count = initProps.initial ?? 0
  return (props) =>
    h('button', { onClick: () => $.count += props.step ?? 1 }, $.count)
}

// ❌ 错误：用 mount 时捕获的 props 渲染，值永远不更新
const Bad = (props, ctx) =>
  () => h('div', {}, props.label)  // props.label 不会随父组件更新
```

### 无 $ 状态组件

不需要 `ctx.ui.$` 的组件：

```tsx
const Button = (_init, ctx) =>
  (props) => h('button', { class: props.variant }, props.children)
```

`$` 可选——只有需要触发 re-render 的状态才用 `$`。

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

## 内部状态管理

| 状态类型 | 存放位置 | 例子 |
|---------|---------|------|
| UI 状态（触发渲染） | `$.xxx` | `$.show`, `$.count` |
| 内部缓存（不触发渲染） | 闭包变量 | `let el`, `let timerId` |
| DOM 引用 | 闭包变量 + ref | `let wrapEl; ref={e => wrapEl=e}` |

```tsx
const Popover = (_init, ctx) => {
  const $ = ctx.ui.$
  $.show = false
  let wrapEl: HTMLElement | undefined

  return (props) =>
    h('div', {
      ref: (el) => { if (el) wrapEl = el },
      onClick: () => $.show = !$.show
    })
}
```

### `$` 深度 Proxy 行为

`ctx.ui.$()` 返回**深度 Proxy**，任意层级赋值自动触发渲染：

- `$.x = val` → 自动排队重渲染
- `$.obj.a = 1` → 自动 dirty（深度递归包装，嵌套对象也是 Proxy）
- `$.arr.push(val)` / `$.arr[0].x = y` → 自动 dirty（数组变异方法内部的 `[[Set]]` 被拦截）
- `delete $.x` → 自动 dirty
- 每个组件实例独立 Proxy，同名变量不冲突

## Render 机制

| API | 触发时机 | 渲染方式 | 使用场景 |
|------|---------|---------|---------|
| `$.x = val` | 赋值后自动 | 微任务批量（异步） | **日常 UI 状态** — 表单输入、切换开关、异步数据加载等绝大多数场景 |
| `ctx.ui.dirty()` | 主动调用 | 微任务批量（异步） | **绕过 Proxy 后手动标记** — 批量修改深层次对象、第三方库直接修改了 `$` 内部数据 |
| `ctx.ui.render()` | 主动调用 | 立即同步 | **需要立即拿到最新 DOM** — DOM 测量、动画触发、第三方库在事件中同步读取 DOM |

### `ctx.ui.$()` — 响应式 Proxy（推荐首选）

`const $ = ctx.ui.$()` 返回一个**深度 Proxy** 对象。任意层级赋值操作自动触发渲染：

```tsx
const $ = ctx.ui.$()
$.count = 0            // → 自动触发渲染（微任务批量）
$.user.name = 'Alice'  // → 自动触发渲染（深度拦截嵌套对象）
$.arr.push('x')        // → 自动触发渲染（数组变异拦截）
$.items[0].done = true // → 自动触发渲染（嵌套属性拦截）
delete $.tmp           // → 自动触发渲染（删除拦截）
```

**何时使用**：所有需要触发 UI 重新渲染的状态。90% 以上的场景用 `$` 就够。

**何时不用**：
- 不需要触发渲染的内部缓存（用闭包变量 `let`）
- 需要在 mount/render/生命周期回调中设置初始值但不触发额外渲染（`$` 在这些阶段自动静默）

### `ctx.ui.dirty()` — 手动标记脏状态

当你需要绕过 Proxy 直接操作底层数据时，操作完后调用 `dirty()` 通知框架在下个微任务批量重渲染：

```tsx
// 场景：从 API 拿到原始数据后批量更新
const raw = await fetchData()                    // 原始 JS 对象
raw.items.forEach(item => { item.processed = true })
$.data = raw                                     // 赋值给 $ → 自动触发渲染 ✓
```

```tsx
// 真正需要 dirty() 的场景：在 _renderCount 保护期内修改了底层对象
// 且无法通过 $.x = val 赋值触发
ctx.ui.onmount(() => {
  // onmount 期间 $.x = val 自动静默（不触发渲染）
  $.initialized = true
  // 如果非要在这里触发渲染，需要手动：
  ctx.ui.dirty()
})
```

**实际上，绝大多数情况下你不需要 `dirty()`。** `$` 的深度 Proxy 已经拦截了深层属性赋值、数组变异方法、属性删除。先赋值给 `$` 永远是更清晰的做法。

### `ctx.ui.render()` — 同步强制渲染

与 `dirty()` 的微任务批量不同，`render()` 是**同步执行**的。调用后立即执行 VDOM diff + patch，DOM 立刻更新。

**何时必须用 `render()` 而不是 `$` / `dirty()`**：

```tsx
// 1. DOM 测量
ctx.ui.onmounted((el) => {
  el.style.height = 'auto'
  ctx.ui.render()               // 同步渲染，确保 layout 已更新
  const h = el.offsetHeight     // 读取最新 DOM 尺寸
  el.style.height = h + 'px'
})

// 2. 动画触发（需要确保上一帧 DOM 已提交）
function startAnimation() {
  $.animating = true
  ctx.ui.render()                // 同步刷新 DOM
  el.startViewTransition(...)    // 拿到最新 DOM 启动动画
}

// 3. 第三方库需要在事件回调中读取最新 DOM
onClick: () => {
  $.selected = !$.selected
  ctx.ui.render()                // 确保 DOM 已更新
  thirdPartyLib.measure(el)      // 读取最新状态
}
```

**规则**：能用 `$` 就用 `$`。只有当你**必须同步拿到最新 DOM 状态**时才用 `render()`。

### 三种方式速查

```tsx
// ✅ 推荐：$.x = val — 自动、批量、无脑
const $ = ctx.ui.$
$.count++
$.name = 'hello'   // 微任务合并，只渲染一次

// ✅ 特殊：ctx.ui.render() — 同步渲染，DOM 立即可见
$.count++
ctx.ui.render()     // DOM 立刻更新
measure(el)         // 读取最新 DOM

// ⚠️ 罕见：ctx.ui.dirty() — 绕过 Proxy 后手动标记
```

**性能说明**：
- `$.x = val` 和 `dirty()` 都是微任务批量合并：同一 tick 内 N 次赋值 → 1 次渲染
- `render()` 每次调用都触发一次完整 diff/patch，频繁调用可能影响性能

### 实践建议：日常开发 vs 组件分享

**日常组件内**：优先用 `$.x = val`，无脑、自动、批量。

**制作可分享组件**（组件库、npm 包、跨项目复用）时，推荐用 `ctx.ui.dirty()` 或 `ctx.ui.render()` 精确控制刷新时机：

```tsx
// 可分享的 Toast 组件：主动控制渲染，避免消费方上下文干扰
const Toast = (_init, ctx) => {
  let items: ToastItem[] = []

  return {
    add(item: ToastItem) {
      items = [...items, item]
      ctx.ui.render()       // 显式同步渲染，确保 DOM 立即可见
    },
    remove(id: string) {
      items = items.filter(i => i.id !== id)
      ctx.ui.dirty()        // 显式标记脏，下个微任务批量渲染
    },
    render: (props) =>
      h('div', { class: 'toast-container' },
        items.map(item => h('div', { key: item.id }, item.msg))
      ),
  }
}
```

理由：
- 分享出去的组件可能被用在各种上下文，`$` 的隐式自动刷新可能不可控
- 暴露 `add/remove` 等命令式 API 时，`render()` / `dirty()` 让刷新时机**显式、可预测**
- 消费方不需要知道组件内部用 `$` 还是闭包，只需调用 API

## ctx.ui 生命周期

```tsx
ctx.ui.onmount(() => { ... })         // 组件首次渲染后（DOM 未创建）
ctx.ui.onunmount(() => { ... })       // 组件移除前清理
ctx.ui.onupdate((prevProps) => {})    // props 变化时触发
```

- 每个方法只保留最后一次注册的 handler（替换模式）
- 所有钩子在 `_renderCount` 保护内执行，`$.x = val` 不触发额外 dirty
- `onmount` 触发时 DOM 还未创建，第三方库初始化仍用 `ref`

### ctx.ui.el — 组件根元素

框架自动追踪组件的根 DOM 元素，通过 `ctx.ui.el` 访问（无需写 `ref`）：

```tsx
const AutoHeight = (_init, ctx) => {
  // render 阶段 ctx.ui.el 指向当前根 DOM
  return (props) => {
    const height = ctx.ui.el?.clientHeight ?? 0
    return h('div', { style: { minHeight: '100px' } }, `高度: ${height}px`)
  }
}

const EChart = (_init, ctx) => {
  let instance: echarts.ECharts | undefined

  // onmounted 阶段 ctx.ui.el 可用
  ctx.ui.onmounted(() => {
    instance = echarts.init(ctx.ui.el!)
    return () => instance?.dispose()
  })

  return (props) =>
    h('div', { style: { width: '100%', height: '400px' } })
}
```

> `ctx.ui.el` 在首次渲染的 mount 阶段为 `null`，首次 render 后及后续 render 中始终指向当前根 DOM。

## ref 管理第三方库

```tsx
const EChart = (_init, ctx) => {
  let instance: echarts.ECharts | undefined

  return (props) =>
    h('div', {
      ref: (el) => {
        if (!el) {
          instance?.dispose()
          instance = undefined
          return
        }
        instance = echarts.init(el)
        instance.setOption(props.option)
        return () => instance?.dispose()
      },
      style: { width: '100%', height: '400px' }
    })
}
```

## 后端中间件模式

```ts
import { createMiddleware } from 'weifuwu'
declare module 'weifuwu' {
  interface Context {
    myField: string
  }
}

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
{
  cond ? <A /> : <B />
}
{
  cond && <A />
}

// 列表 - 必须有 key
{
  items.map((item) => <div key={item.id}>{item.name}</div>)
}
```

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
// 修改 state 后重新渲染
ctx.ui.$.show = true
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
