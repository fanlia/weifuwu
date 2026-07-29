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
- **状态驱动渲染** — `ctx.ui.$` 深度 Proxy，赋值自动触发 VDOM patch
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
  const $ = ctx.ui.$
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

## Render 机制

| API | 触发时机 | 渲染方式 | 使用场景 |
|------|---------|---------|---------|
| `$.x = val` | 赋值后自动 | 微任务批量（异步） | **日常 UI 状态** — 表单输入、切换开关、异步数据加载等绝大多数场景 |
| `ctx.ui.dirty()` | 主动调用 | 微任务批量（异步） | **绕过 Proxy 后手动标记** |
| `ctx.ui.render()` | 主动调用 | 立即同步 | **需要立即拿到最新 DOM** — DOM 测量、动画触发 |

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
