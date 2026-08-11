# ui-dom — 前端运行时（UIRouter + uiServe + SSR/hydration）

> **weifuwu 前端唯一运行时**（`weifuwu/ui-dom`，随 npm 包发布）：
> **UIRouter（纯路由 + ctx 注入链）+ uiServe（渲染运行时）+ ssrPage/hydration**，
> 复用 `weifuwu/components`（VNode 契约唯一来源，组件零修改）。
> 已取代 `weifuwu/client`——前端运行时唯一入口（createApp/router 旧 API 已删除）。
>
> 概念对齐：**req = window.location**，**res = VNode**（数据结构），
> **uiServe = VDOM**（落地机制），**params/query 在 ctx**（对齐后端 `ctx.params`）。

## 为什么是 ui-dom（开发者价值）

### 心智模型统一：一套 API 贯穿两端，无需「两套前端」

```
后端: Request → [Middleware → ctx.field] → Handler → Response
前端: window.location → [UIMiddleware → ctx.field] → Handler → VNode
```

- **req/res 契约同构**：`UIRequest = window.location`（原生对象，不包装）对齐后端 `Request`；`UIResponse = VNode` 对齐 `Response`。后端开发者迁移到前端，中间件思维直接复用（`app.use(mw)` 与 `router.use(mw)` 累积类型同构）。
- **SSR 不是另一套代码**：同一份 `router.ts`（两端共享），`ssrPage(router, { url })` 服务端直接跑，`uiServe(router, { root, hydrate: true })` 客户端收养。`ctx.data.get(key)` 一个 API 三场景自动适配（SSR 真 fetch → 序列化进 `__DATA__` → hydration 种子命中 → SPA 未命中触发 fetcher）——**开发者不需要理解「首屏/水合/客户端渲染」的区别**。

### 两阶段组件模型：从 hooks 心智负担中解脱

```tsx
const Counter = (initProps, ctx) => {
  let count = initProps.initial ?? 0        // mount：只执行一次
  return (props) =>
    h('button', { onClick: () => { count += props.step; ctx.ui.render() } }, count)  // render
}
```

- **没有 hooks 规则、没有依赖数组、没有闭包陷阱**。外层 = 初始化（一次），内层 = 渲染（每次变化）。
- **render-only 确定性渲染**（design/render-only-plan.md）：渲染只发生在 `ctx.ui.render()` 调用处——改状态后显式 `render()`，行为可静态推导。无 `$` Proxy、无隐式触发；跨组件共享用 `createStore` + `ctx.ui.useExternal()`。

### 框架即纪律：浏览器环境抽象把常见坑变成编译期/审计期错误

- **`ctx.browser` 唯一入口**：复制/查询/滚动/存储/主题/定时器/媒体查询/事件监听全部经 BrowserEnv（组件侧 46 处迁移清零 + 测试侧 ~300 处对齐，SSR shim 三态同构）。开发者不需要记「SSR 里 `window.innerWidth` 会崩」这类环境知识——**框架替他们承担**。
- **诚实裁剪**：不支持的能力明确抛 `ProtocolError('unsupported')`——确定性失败，绝不静默降级。

### 零依赖 + 确定性：可审计、可测试、可读的运行时

- **零 npm 运行时依赖**（对比 React + react-dom + react-router + 状态库 + SSR 工具 5+ 依赖）。
- **自研 VDOM/diff**（keyed children、style diff、CSS 变量、Portal、hydration 游标收养）——每个算法都有对应测试与纪律条目（真实事故沉淀）。**读源码即可完全理解框架行为**。
- **零构建步骤**：`weifuwu/dev` loader + `ctx.ui.js/css` 动态编译，服务端直接跑 `.tsx`，改组件刷新即生效。

### 弹层/浮层体系：最难的 UI 类别变成复用的原语

`ctx.ui.usePopup()` 一个组合器覆盖：portal 渲染、fixed 定位 + 视口夹紧、锚点变化自动重算、外部点击/Escape 关闭、el-null 微任务重试、ref 稳定化。**开发者不需要再写任何弹层脚手架**——这是传统前端最常重复造轮子的地方。弹窗纪律（portal 必须、z-index token、exit 动画成对）由审计测试强制。

### 对贡献者的价值：纪律 = 事故沉淀

AGENTS.md 每条纪律对应真实事故（JSONViewer selfId 错位、AutoComplete 焦点丢失、TreeSelect 0 rect、Kanban draggable 空字符串解析 false）——新贡献者站在「踩过坑」的肩膀上。分层清晰（UIRouter 纯路由 → uiServe 装配点 → ctx.browser 环境边界 → components 消费层），改动边界由架构约束，协议层改动 TDD 先行 + 真实库验证（CS-04/CS-05）。

| 维度 | 价值 |
|------|------|
| **上手** | 两阶段组件 + 改状态后 render()——无 hooks/依赖数组心智负担 |
| **后端互迁** | req/res/中间件契约同构，SSR 透明，一份 router 两端共享 |
| **可靠性** | 确定性失败、诚实裁剪、环境边界、测试侧同构 |
| **效率** | 弹层/数据管道/事件原语全覆盖——不重复造轮子 |
| **可维护** | 零依赖可审计、纪律沉淀事故教训、构建可选 |

> 一句话：ui-dom 不是「又一个 React」——它是把 weifuwu 后端中间件生态的确定性、可测试性和纪律性，原样移植到了前端。开发者得到的是一个行为可预测、失败可预期、源码可读懂的运行时。

## 快速开始

```tsx
import { UIRouter, uiServe, h } from './src/ui-dom/index.ts'
import { toast } from './src/ui-dom/Toast.ts'
import { Button } from './src/components/index.ts'

const app = new UIRouter()

app.use(toast()) // ctx 注入链（对齐后端 app.use——注入 ctx.toast）

// handler = 异步组件：async (location, ctx) => VNode（render-only——改状态后 ctx.ui.render()）
app.get('/', async (location, ctx) => {
  const info = await ctx.data.get('/api/info', async () => ({ title: '首页' }))
  let clicks = 0
  return h('div', {},
    h('h2', {}, info.title),
    h(Button, { onClick: () => { clicks++; ctx.ui.render() } }, `点击 ${clicks} 次`),
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

VNode 契约以 ui-dom 为唯一来源（Fragment/Portal symbol 由 ui-dom 自持）——components 产的 VNode
直接被 ui-dom 渲染器识别。渲染算法（render/diff/createUi 原语）在 ui-dom 内自主实现，
**registry/popup-tracker 局部实例**（serve 每实例隔离）。

命令式工厂（toast/confirm/notification）位于 ui-dom（`src/ui-dom/Toast.ts` 等）：
components 消费端 import `weifuwu/ui-dom`（构建外部化，共享同一模块实例）。

### render-only 渲染（唯一触发：ctx.ui.render()）

| 原语 | 触发 | 重渲染范围 |
|------|------|-----------|
| `ctx.ui.render()`（无参） | 主动调用 | 当前组件（闭包绑定，无 this 陷阱） |
| `ctx.ui.render(['id'])` | 主动调用 | 指定组件（selfId 注册的语义 ID） |
| `ctx.ui.useExternal(store)` | store 变更自动 | **仅订阅组件**（unmount 自动退订） |

- 状态是普通对象（`let` / `createStore`）——改状态后显式 `render()`，无赋值自动渲染
- 跨组件共享：`createStore` + `useExternal`（替代已删除的 `$` Proxy / `dirty`）
- hooks（useMedia/useInView/usePopup 等）事件驱动重渲染——与"赋值自动"本质不同

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
- renderSsr：组件两阶段 + async 组件 await（数据 per-request）/ Portal 内联 / 事件剥离
- SSR 确定性：ui 19 原语 shim 全 no-op（不启动监听/会话）；渲染期非确定性由开发者规避

## ctx 注入

| 字段 | 说明 |
|------|------|
| `ctx.params` / `ctx.query` | 路由参数 / URL query（顶层，对齐后端） |
| `ctx.data.get/set/has` | 数据管道（缓存 + in-flight 合并 + `__DATA__` 种子） |
| `ctx.ui.*` | 原语（`render`/`useExternal`/`usePopup`/`useChat`/`useInView`…） |
| `ctx.browser.*` | 环境抽象（window/document 唯一入口，SSR shim 同构） |
| `ctx.toast` / `ctx.confirm` / `ctx.notification` | 命令式注入（`app.use(toast())` 等） |

## demo

`apps/ui-router-demo`：UIRouter + uiServe + components（Button/Input/Tag/Dropdown）
+ toast 注入 + 嵌套路由 + SSR/hydrate 端到端（原生 async 组件页 `/async` 验证
占位补全 + `__DATA__` 三场景）。server 用 weifuwu serve + `ui()` 中间件
（`ctx.ui.js` 编译前端 / `ctx.ui.css` 组件样式 / `/*` → ssrPage）。
启动：`node apps/ui-router-demo/server.ts` → http://localhost:3100
