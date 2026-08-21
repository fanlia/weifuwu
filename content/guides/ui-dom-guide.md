# 前端运行时指南（UIRouter/渲染器）

> 从 docs/frontend-ui-dom.md 迁移（content/ 文档库——随 npm 包发布，与框架版本同步）。
> 本页为叙述性指南——组件/能力逐项参考见 content/ 各域目录。

# ui-dom — 前端运行时（vdom3 精准事件流引擎）

> **createRouter（路由）+ createRoot（挂载）+ 精准事件流（渲染本体）**，
> 组件 = 两阶段异步组件（`async (initProps, ctx) => (props) => VNode`），
> **params 在 ctx**（对齐后端 `ctx.params`），渲染全链路可观测/可回放/可断言。

## 架构：vdom3 事件流引擎

```
用户操作（ctx.render()）
  → 决策层事件（jsx/vdom）：comp:render → vnode:patch（reuse/rebuild 决策）
  → 执行层事件（dom）：node:create/insert/remove/move、prop:update、
    text:update、event:bind/unbind、ref:cleanup
  → DOM（精准状态变化——事件数 = 实际变化数）
```

- **统一命名**：对象 + 动作 + 参数（`{ entity, action, target, payload }`——键 `entity:action`）——location（`route:change`）/ jsx（`comp:render`/`props:update`）/ vdom（`vnode:patch`）/ dom（`node:insert` 等）四层同构
- **DOM = fold(事件流)**：初始 DOM + 事件序列 = 任意时刻 DOM——可记录（`stream.events()`）、回放（`replay`）、断言（`expectEventSequence`/`eventsOf`）
- **不变量：无事件流不渲染**——所有状态变化都通过事件流（DOM 操作/组件生命周期/索引/事件注册/错误/挂起/内部决策/文本操作/副作用）——静态审计 + 运行时对照审计（`__WF_VDOM_AUDIT='1'`）守护
- **render-only**：渲染唯一触发 `ctx.render()`（组件级——只重跑该组件 renderFn + patch 其输出，兄弟零执行）；`ctx.ui.render()` 为兼容面（同义）
- **组件级精准更新**：`ctx.render()` 只刷新自身——组件 O(1) 索引定位——props 未变的子组件剪枝——事件数 = 实际变化数

### 事件代理（所有监听统一注册表）

元素事件/全局监听/动画钩子全部收敛到**代理注册表**（`delegate.ts`）：
- 元素事件（onClick 等 props）→ 挂载点监听（每挂载点每事件一次——O(1)）+ 按 data-v3-id 祖先链分发（handler 更新 = Map 覆盖——**零重绑零噪音**）
- 全局监听（keydown/mousedown/pointer/popstate/scroll/选区/剪贴板）→ `addGlobalListener`（同事件聚合——EventTarget 每事件一次）
- 动画钩子（animationend）→ `bindElementListener`（once 自动解绑）
- 不冒泡事件（error/load）→ 捕获监听；`e.currentTarget` 还原为绑定元素（与元素级语义一致）

## 快速开始（SPA）

```tsx
import { createRouter, h } from 'weifuwu/ui-dom'
import { Button } from 'weifuwu/components'

// 两阶段异步组件：外层工厂（mount 一次——状态/数据），内层 renderFn（每次渲染）
const Counter = async (_init, ctx) => {
  let count = 0
  return async () =>
    h('div', {},
      h('button', {
        onClick: () => { count++; ctx.render() },   // render-only：显式触发
      }, `count:${count}`),
    )
}

createRouter(
  [{ path: '/', render: () => h(Counter, {}) }],
  document.querySelector('#root') as HTMLElement,
)
```

- 页面组件 ctx：`ctx.render()`（页面级刷新）/ `ctx.route`（`{ path, params }`——动态参数）/ `ctx.ui`（24 hooks）
- 中间件面注入：`createRouter(routes, root, { ctx })`——`ctx` 为中间件展开结果（`api/auth/toast/confirm/i18n` 等——与后端 `app.use` 同理念）：

```ts
let ctx: any = {}
ctx = await api({ baseURL: '', token: ... })(ctx)
ctx = auth({ ... })(ctx)
ctx = v3Toast()(ctx)
ctx = v3Notification()(ctx)
createRouter([...], root, { ctx })
```

## 无路由挂载（createRoot）

组件树直接挂载（弹窗宿主、微前端片段、非路由页面）：

```ts
import { createRoot, h } from 'weifuwu/ui-dom'
const handle = createRoot(h(App, {}), document.getElementById('root')!, { ctx })
await handle.ready  // 首帧完成
```

## ctx.ui（组件库消费面——24 hooks）

`useExternal`（共享状态）/ `useControlled`/`useControlledInput`（受控原语）/ `useOpen`/`usePopup`（弹层组合器——portal 定位/Escape/外部点击）/ `usePopupPosition` / `useTween` / `useInView` / `useScrollPosition` / `useGlobalKey` / `useDrag`/`useDragDrop` / `useMedia`/`useBreakpoint` / `useReducedMotion` / `useStableRef` / `useAnimationEnd` / `usePresence`（退场状态机）/ `useLongPress` / `useHoverCapable` / `useVisualViewport` / `useAsync` / `useChat`（AI 会话——消息/工具调用/审批）。

组件库（weifuwu/components）零引擎耦合：只消费 `ctx.ui` 契约——vdom3 与未来引擎可无缝替换。

## 事件流可观测（调试/测试）

```ts
import { stream, evKey } from 'weifuwu/ui-dom'
import { eventsOf, expectEventSequence } from 'weifuwu/ui-dom'

const events = stream.events()
eventsOf(events, 'node:create').length   // 创建了几个节点
// 决策层事件解释"为什么"（reuse/rebuild），执行层事件是"做了什么"——完全可断言
```

**完整事件覆盖**（任何问题都在事件流可定位）：
- **错误**：`error:throw/caught`（工厂/renderFn/挂载/更新失败——phase 定位）+ **挂起超时**（renderFn/buildVNode 永不 resolve → 3s 检测——静默失败不再静默）
- **内部决策**：`internal:queue/notfound/skip`（busy 排队/组件未定位）
- **事件流自身**：`stream:overflow`（溢出可审计）/ `stream:watermark`（水位预警）/ `size()`/`capacity()`/`overflowCount()`/`subscribe(filter, fn)`（按层过滤订阅）
- **文本操作**：`text:input`（输入/组合）/ `text:select`（选区）/ `text:copy/cut/paste`（剪贴板摘要）
- **组件副作用**：`ref:mount` + `effect:animate/lock/unlock/focus/scroll`（动画/滚动锁/焦点 trap/滚动）

测试纪律（jsdom）：`renderVNode`（VNode 层）/ `mountComponent`（同实例 re-render）/ `expectEventSequence`（精确事件序列）——渲染 = 事件序列断言。

### 多应用加载（app 节点）

```ts
import { registerApp, App } from 'weifuwu/ui-dom'

// 注册子应用（工厂——可 await 初始化——appId 复用不重跑）
registerApp('mini-todo', (props, ctx) => h(MiniTodo, {}))
// 父树中嵌入（不隔离设计——共享流/全局 id——天然归属唯一）
h(App, { appId: 'mini-todo', props: { title } })
```
- 边界事件（同流）：`app:mount` / `app:update`（props keys）/ `app:unmount` / `app:error`（unknown-app）——payload 带 appId 可区分
- 子应用独立状态（工厂闭包）——渲染/事件与父同流（全链路可观测——调试一条流）

## SSR（事件流形态——DOM = fold 不变量）

vdom3 SSR 不是 HTML 字符串 + 游标收养，而是**事件流序列化**：

```ts
// 服务端：构建 → 事件流 → HTML + 序列化事件
import { renderToEvents, eventsToHtml, serializeEvents } from 'weifuwu/ui-dom'
const events = await renderToEvents(vnode)      // 事件流（node:create/insert/...）
const html = eventsToHtml(events)                // 首帧 HTML
const data = serializeEvents(events)             // 序列化事件（__DATA__）
// 客户端：replay(events, root) —— 零 DOM 猜测，与服务端 HTML 同构
import { deserializeEvents, replay } from 'weifuwu/ui-dom'
replay(deserializeEvents(data), root)
```

`ctx.data.get(key, fetcher)` 三场景自动适配（SSR 真 fetch → 序列化进 `__DATA__` → 客户端种子命中 → SPA 未命中触发 fetcher）。

## 组件纪律速查（事故沉淀——详见 AGENTS.md）

- **render-only**：状态是普通对象（`let` + 显式 `render()`）——禁止隐式触发
- **mount/render 分工**：只依赖稳定引用的回调（ctx/挂载闭包）→ mount 定义（零重绑）；依赖最新 props → render 内定义（重绑是正确性要求）
- **ref 稳定**：带清理的 ref 定义在 mount 作用域（内联 ref 每次渲染新函数 → ref(null) 反复触发）
- **浮层**：`ctx.ui.openPopup`（命令式——#__wf_portal 统一容器）——禁止 absolute 相对父容器
- **浏览器环境**：组件用 `ctx.browser`（禁裸 window/document）——SSR 安全三态
- **事件 handler**：代理 Map 覆盖——handler 更新零重绑零事件（稳定引用仅为性能建议——结构共享收益前提）
- **props 不可变（红线——Chat 空 bubble 事故）**：**禁止原地修改 props 引用的对象**（`m.content += text`）——vdom3 剪枝按 props 浅比较判断"未变"→ 复用旧输出 → 渲染不更新。**状态更新必须新建对象**（`$.msgs[i] = { ...m, content: ... }`——引用变 → 剪枝不命中 → 重渲染）。排查"渲染没更新"时看 `__wf_tail` 的 `comp:build` 事件 `reason: 'reuse-skip'`（= 契约：props 引用未变）

## 与后端共享

- 中间件理念同构：后端 `app.use`（ctx.sql/redis/api/...）↔ 前端 `createRouter(routes, root, { ctx })`（ctx.api/auth/...）
- 路由参数：`ctx.route.params`（对齐后端 `ctx.params`）
- `weifuwu/dev`（Node loader）：服务端直接跑 `.tsx`——与 `ctx.ui.js` 前端动态编译对称，两端同一 JSX 运行时

## 参考

- 组件库蓝本：`apps/components-demo`（115 组件 + createRouter 装配）
- 完整应用：`apps/agent-platform`（多租户 AI 平台——认证守卫/嵌套布局/AI 会话）
- 布局蓝本：`apps/layouts-demo`（8 种布局模式）
