# weifuwu — 架构约束与编码标准

全栈框架：后端 `(req, ctx) => Response` + 前端 `(props, ctx) => VNode` + 纯 CSS 布局。

## 架构

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: createApp → [AppMiddleware → ctx.field] → Component → VNode → DOM
```

- **中间件注入 ctx** — `ctx.sql`, `ctx.redis`, `ctx.ui`, `ctx.route`, `ctx.api`, `ctx.auth`, `ctx.ws`, `ctx.i18n`
- **状态驱动渲染** — `ctx.ui.$` 深度 Proxy，赋值自动触发 VDOM patch
- **组件 = 纯函数** — `(props, ctx) => VNode | null | (props) => VNode`，无 class/hook/this
- **两阶段模型（可选）** — 外层函数 = mount（只一次），内层返回函数 = render（每次 dirty/props 变化）
- **生命周期** — `ctx.ui.onmount/onunmount/onupdate` 显式注册
- **VDOM 支持 innerHTML** — 直接用 `innerHTML` prop 设置 HTML 内容（替代手动 `el.innerHTML`）
- **ref 管理第三方库生命周期** — `ref={el => { init; return () => cleanup }}`，卸载时框架保证调用

## 组件写法（三种模式自由选择）

### 模式 1：无状态组件

```tsx
const Button = (props: { label: string }, ctx) =>
  h('button', {}, props.label)
```

### 模式 2：单函数 + 新生命周期

```tsx
const Toggle = (props, ctx) => {
  const $ = ctx.ui.$
  // mount 阶段初始化（两阶段模型中在外层直接写）
  if ($.on === undefined) $.on = false

  ctx.ui.onunmount(() => cleanup())  // 每次 render 替换，只保留最新

  return h('button', {
    onClick: () => $.on = !$.on
  }, $.on ? '开' : '关')
}
```

### 模式 3：两阶段（推荐有状态组件）

```tsx
const Toggle = (props, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  $.on = false

  ctx.ui.onunmount(() => { timer?.clear() })

  // ── render（每次 dirty/props 变化）──
  return (props) =>
    h('button', { onClick: () => $.on = !$.on }, $.on ? '开' : '关')
}
```

### 选择指南

| 组件复杂度 | 推荐模式 | 原因 |
|-----------|---------|------|
| 纯展示、无状态 | 模式 1 | 最简单，无框架概念 |
| 简单交互、少量 `$` | 模式 2 | 加生命周期钩子，不改结构 |
| 复杂状态、DOM ref、异步 | 模式 3 | mount/render 自然分离 |

## 核心标准速查

| ID     | 规则                                             | 代码中的体现                              |
| ------ | ------------------------------------------------ | ----------------------------------------- |
| CS-01  | `throw`/`return` 后不留死代码                    | if-else 都需 return                       |
| CS-02  | Promise 必须 await 或 catch                      | 无 `.then()` 无 catch                     |
| CS-03  | Event listener 内用 `console.error` 不用 `throw` | `server.on('error', ...)`                 |
| FS-01  | 组件 = `(props, ctx) => VNode \| (props) => VNode` | 无 class/hook/this                     |
| FS-03  | Proxy 驱动渲染，`innerHTML` 替代手动 DOM         | `$.x = val` / `<div innerHTML={html} />`  |
| FS-04  | 禁止 eval/new Function                           | 安全基线                                  |
| FS-05  | 前端无 npm 运行时依赖                            | client 包 import 无外部 dep               |
| PS-01  | 请求路径无同步 I/O                               | 无 readFileSync/execSync                  |
| RDR-01 | render 阶段不写 `$`                              | `$` 写入在 mount 阶段或事件回调中          |

## 内部状态管理

### 三类状态的区分

| 状态类型 | 存放位置 | 例子 | 说明 |
|---------|---------|------|------|
| UI 状态（触发渲染） | `$.xxx` | `$.show`, `$.count` | 赋值自动 dirty |
| 内部缓存（不触发渲染） | 闭包变量 | `let el`, `let timerId` | JS 原生变量 |
| DOM 引用 | 闭包变量 + ref | `let wrapEl; ref={e => wrapEl=e}` | 通过 ref 回调赋值 |

```tsx
const Popover = (props, ctx) => {
  const $ = ctx.ui.$
  $.show = false                      // UI 状态 → 触发脏检查
  let wrapEl: HTMLElement | undefined // 内部引用 → 闭包变量

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

### 旧版 `$._xxx` 仍兼容

`_` 前缀变量不触发 dirty。两阶段模型推荐改用闭包变量。

## ctx.ui 生命周期

```tsx
ctx.ui.onmount(() => { ... })       // 组件首次渲染后（DOM 未创建）
ctx.ui.onunmount(() => { ... })     // 组件移除前清理
ctx.ui.onupdate((prevProps) => {})  // props 变化时触发
```

- 每个事件类型只保留最后一次注册的 handler（替换模式）
  - 单函数模式：每次 render 替换，unmount 时只执行最新的清理
  - 两阶段模式：mount 阶段注册一次，持久生效
- `mount` 触发时 DOM 还未创建，第三方库初始化仍用 `ref`

## ref 管理第三方库

```tsx
const EChart = (props, ctx) => {
  let instance: echarts.ECharts | undefined

  return h('div', {
    ref: (el) => {
      if (!el) {                         // unmount
        instance?.dispose()
        instance = undefined
        return
      }
      instance = echarts.init(el)        // mount
      instance.setOption(props.option)
      return () => instance?.dispose()   // cleanup
    },
    style: { width: '100%', height: '400px' }
  })
}
```

## 异步组件

```tsx
const UserProfile = async (props, ctx) => {
  const $ = ctx.ui.$
  $.loading = true

  const user = await fetch(`/api/user/${props.id}`).then(r => r.json())

  $.loading = false
  $.user = user

  return (props) =>
    $.loading
      ? h('div', {}, 'Loading...')
      : h('div', {}, $.user.name)
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
- 组件测试：调用 `MyComponent(props, mockCtx)` 断言 VNode
- 两阶段组件测试：先 mount 获取 renderFn，再调用 `renderFn(props)` 得到 VNode

```tsx
// 无状态组件
const vnode = Button(props, mockCtx())

// 两阶段组件
const result = Popover(props, ctx)
const renderFn = typeof result === 'function' ? result : null
const vnode = renderFn!(props)
```

- `$` 状态：直接修改 `ctx.ui.$.xxx = val` 后调用 renderFn

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
