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

### `$` Proxy 行为

- `$.x = val` → 自动排队重渲染
- `$.arr.push(val)` / `$.arr[0].x = y` → 自动 dirty（Proxy 深度拦截）
- `ctx.ui.dirty()` → 绕过 Proxy 直接操作底层对象后手动触发
- 每个组件实例独立 Proxy，同名变量不冲突

## ctx.ui 生命周期

```tsx
ctx.ui.onmount(() => { ... })         // 组件首次渲染后（DOM 未创建）
ctx.ui.onunmount(() => { ... })       // 组件移除前清理
ctx.ui.onupdate((prevProps) => {})    // props 变化时触发
```

- 每个方法只保留最后一次注册的 handler（替换模式）
- 所有钩子在 `_renderCount` 保护内执行，`$.x = val` 不触发额外 dirty
- `onmount` 触发时 DOM 还未创建，第三方库初始化仍用 `ref`

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
