# 前端 API 核心（weifuwu/client）

> 以下为完整 API 参考，按需查阅。新手建议先阅读 README 的「核心概念」和「快速开始」。

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

零外部 npm 运行时依赖。组件签名：`(initProps, ctx) => (props) => VNode`（两阶段模型，外层 mount 只一次，内层 render 每次变化时执行）。无状态组件可简写为 `() => () => VNode`。

构建配置（esbuild）：

```js
esbuild.build({
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

---

## createApp — 应用引导

```tsx
import { createApp } from 'weifuwu/client'

const app = createApp()

// 注册中间件
app.use(middleware1)
app.use(middleware2)

// 挂载到 DOM
app.mount('#root', RootComponent)

// 获取当前 ctx
console.log(app.ctx)

// 销毁
app.destroy()
```

| 方法 | 说明 |
|------|------|
| `createApp()` | 创建应用实例 |
| `app.use(mw)` | 注册 AppMiddleware |
| `app.mount(selector, RootComponent)` | 挂载到 DOM |
| `app.destroy()` | 卸载应用 |
| `app.ctx` | 当前 WfuiContext |

---

## 组件模型

```tsx
import type { Component, WfuiContext } from 'weifuwu/client'

// 两阶段组件：mount（只一次）→ render（每次 dirty/props 变化）
const Counter: Component = (_init, ctx) => {
  // ── mount ──
  let count = 0

  // ── render ──
  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}

// 无状态组件：只有 render
const Badge: Component = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

### 类型流（props 泛型 + ctx 注入）

```tsx
import type { Component } from 'weifuwu/client'
import type { ApiInjected, RouteInjected } from 'weifuwu/client'

// ① props 泛型：JSX 使用时自动类型检查（传错类型编译期报错）
interface DeckCardProps { title: string; pages: number }
const DeckCard: Component<DeckCardProps> = (_init, ctx) =>
  (props) => <div>{props.title} / {props.pages} 页</div>
// <DeckCard title="x" pages={8} />     ✓
// <DeckCard title="x" pages="8" />     ✗ 编译期报错

// ② ctx 注入声明：use(api()).use(router()) 后组件声明依赖，ctx 直接访问
const Home: Component<{}, ApiInjected & RouteInjected> = (_init, ctx) => {
  ctx.api.get('/users')   // ✓ 有类型
  ctx.app.navigate('/x')  // ✓ 有类型
  return () => <h1>Home</h1>
}
// 未声明的注入字段编译期报错——注入从"文档约定"变成"类型保证"

createApp()
  .use(api())                    // 注入 ctx.api
  .use(router({ routes }))       // 注入 ctx.route / ctx.app
  .mount('#root', Home)          // mount 时类型累积完整
```

> 各中间件的注入接口：`api()` → `ApiInjected`、`auth()` → `AuthInjected`、`ws()` → `WsInjected`、`i18n()` → `I18nInjected`、`router()` → `RouteInjected`（均可从 `weifuwu/client` 导入）。

| 规则 | 说明 |
|------|------|
| 组件签名 | `(initProps: P, ctx: WfuiContext) => (props: P) => VNode \| null` |
| mount 阶段 | 外层函数只执行一次，初始化状态 |
| render 阶段 | 内层函数每次 dirty/props 变化时执行，返回 VNode |
| 无 class | 无 `this`，无实例方法 |
| 无 hook | 无 `useState` / `useEffect` / `useMemo` |
| 状态 | 闭包变量 + `ctx.ui.render()` 手动触发，或 `ctx.ui.$()` 响应式容器 |
| ref 引用 | `ref={el => { if (el) init; else cleanup }}` 获取 DOM |

### JSX 工厂

```tsx
// 由 esbuild 自动调用（jsxImportSource: 'weifuwu/client'）
import { h, jsx, jsxs, jsxDEV, Fragment } from 'weifuwu/client'

// h 支持 variadic children
h('div', { class: 'x' }, child1, child2)

// Fragment
<><div>A</div><div>B</div></>
```

| 导出 | 用途 |
|------|------|
| `h(type, props, ...children)` | hyperscript |
| `jsx` / `jsxs` / `jsxDEV` | JSX 编译目标 |
| `Fragment` | 片段 |
| `Portal` / `createPortal(children, portalKey?)` | 渲染到 `document.body#__wf_portal` 独立容器（弹层/对话框，脱离父级 overflow 裁剪） |

```tsx
import { createPortal } from 'weifuwu/client'

// 内容渲染到 body 下的独立容器（不在父组件的 DOM 树内）
const Tooltip = (_init, ctx) =>
  (props) => createPortal(
    <div class="tooltip">{props.text}</div>
  )

// 配合 ctx.ui.selfId('name') 可从任何地方精准刷新 portal 内容
ctx.ui.render(['name'])
```

---

## 状态管理

### ctx.ui 方法速查

| 方法 | 签名 | 一句话说明 |
|------|------|-----------|
| `$()` | `$(): Record<string, any>` | 深度 Proxy 响应式状态容器，赋值自动触发渲染（**推荐首选**） |
| `render()` | `render(ids?: string[])` | 同步强制渲染；无参 = 当前组件，传参 = 指定组件列表 |
| `dirty()` | `dirty(ids?: string[])` | 异步渲染（微任务批处理合并）；`$` 内部就是调它 |
| `selfId()` | `selfId(name: string)` | 注册组件自定义 ID，配合 `render(['id'])` 跨组件精准刷新 |
| `useMedia()` | `useMedia(query, cb)` | 响应式媒体查询，断点变化时自动回调 |
| `useBreakpoint()` | `useBreakpoint(cb \| bps, cb?)` | 命名断点 mobile/tablet/desktop |
| `usePopupPosition()` | `usePopupPosition(opts)` | 弹层坐标跟随：scroll/resize 时自动重算 fixed 坐标 |
| `usePopup()` | `usePopup(opts)` | **弹层组合器**：触发（hover/tap 降级/longpress）+ Escape + 外部点击 + 定位/clamp + portal |
| `useHoverCapable()` | `useHoverCapable()` | 设备是否支持 hover（`matchMedia '(hover: hover)'`），触屏降级判断 |
| `useLongPress()` | `useLongPress({ onLongPress, duration })` | 长按手势（pointer 事件 + 位移取消 + 桌面右键兼容） |
| `useVisualViewport()` | `useVisualViewport()` | 可视视口跟踪（键盘弹起/缩放），`{ height, offsetTop, keyboardOpen }` 响应式 |
| `useInView()` | `useInView(opts)` | 可见性观察（IntersectionObserver 封装，替代组件自建 scroll 监听）；`isIn` 响应式 + `ready` |
| `useScrollPosition()` | `useScrollPosition({ getScroller? })` | 滚动位置跟踪（全局 scroll 监听 + rAF 节流）；`y` 响应式，容器/视口通用 |

> 每个方法的完整说明见下文对应章节。

### Render 机制总览

| API | 触发时机 | 渲染方式 | 作用域 | 使用场景 |
|------|---------|---------|--------|---------|
| `$.x = val` | 赋值后自动 | 微任务批量（异步） | 当前组件 | **日常 UI 状态** — 表单输入、切换开关、异步数据加载等 |
| `ctx.ui.dirty()` | 主动调用 | 微任务批量（异步） | 当前/指定 | **绕过 Proxy 后手动标记** |
| `ctx.ui.render()` | 主动调用 | 立即同步 | 当前/指定 | **需要立即拿到最新 DOM** — DOM 测量、动画触发 |
| `ctx.ui.render(['id'])` | 主动调用 | 立即同步 | 指定组件 | **跨组件精准刷新** — 全局事件、Portal 远程控制 |
| `ctx.ui.useMedia()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **响应式媒体查询** — 断点变化时自动 dirty |
| `ctx.ui.useBreakpoint()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **命名断点** — mobile/tablet/desktop 自动 dirty |
| `ctx.ui.usePopupPosition()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **弹层坐标跟随** — scroll/resize 时自动重算 fixed 坐标 |
| `ctx.ui.usePopup()` | 注册监听 | 事件驱动 + document 监听 | 当前组件 | **弹层组合器** — 触发 + Escape + 外部点击 + 定位/clamp + portal（移动端友好由构造保证） |
| `ctx.ui.useHoverCapable()` | mount 期判定 | 一次 matchMedia | 当前组件 | **hover 能力检测** — 触屏降级 tap 判断 |
| `ctx.ui.useLongPress()` | 事件驱动 | pointer 事件 | 当前组件 | **长按手势** — ContextMenu 触屏触发、自定义长按操作 |
| `ctx.ui.useVisualViewport()` | 注册监听 | visualViewport resize/scroll | 当前组件 | **键盘/缩放跟踪** — fixed 底部栏防键盘遮挡（AiChat `raiseOnKeyboard`） |
| `ctx.ui.useInView()` | 注册监听 | IO 合成器线程评估 | 当前组件 | **可见性观察**（IO 封装，无 scroll-linked 警告）— Affix/BackTop/InView 统一使用；rootMargin/threshold 支持函数 |
| `ctx.ui.useScrollPosition()` | 注册监听 | 全局 scroll + rAF 节流 | 当前组件 | **滚动位置跟踪** — `y` 响应式（视口/内部容器通用），Affix/VirtualList 使用 |

`render()` 和 `dirty()` 无参 = 当前组件，传参 = 指定组件列表。三套 API 同一 scope 机制。

### 闭包变量 + `ctx.ui.render()`（简单场景）

```tsx
const Counter: Component = (_init, ctx) => {
  let count = 0
  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}
```

适合状态极少的简单组件。每次修改后手动调用 `ctx.ui.render()` 同步刷新 DOM。

### `ctx.ui.$()` — 响应式 Proxy（推荐首选）

`ctx.ui.$()` 返回**深度 Proxy** 容器。任意层级赋值操作自动触发渲染（微任务批量合并）：

```tsx
const FormPage: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.email = ''
  $.loading = false
  return (props) =>
    h('input', {
      value: $.email,
      onInput: (e: any) => { $.email = e.target.value }
    })
}
```

**深度 Proxy 拦截**：
- `$.x = val` → 自动排队重渲染
- `$.obj.a = 1` → 自动 dirty（嵌套对象递归包装）
- `$.arr.push(val)` / `$.arr[0].x = y` → 自动 dirty（数组变异 + 嵌套属性拦截）
- `delete $.x` → 自动 dirty
- 每个组件实例独立 Proxy，同名变量不冲突

**注意**：mount/render 中 `$.x = val` **不触发渲染**，仅事件/timer/Promise.then 中生效。这是有意设计——初始化和 mount 阶段设置状态不应触发额外渲染。

**何时用 `$`**：所有需要触发 UI 重新渲染的状态。90% 以上的场景用 `$` 就够。

**何时不用**：
- 不需要触发渲染的内部缓存（用闭包变量 `let`）
- 简单组件只有一两个状态变量（闭包变量 + `render()` 更轻量）

### 响应式自适应组件

#### `ctx.ui.useMedia(query, callback)` — 响应式媒体查询

注册媒体查询监听，值变化时自动调用 callback（callback 内赋值 `$` 触发 dirty）：

```tsx
const Card = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.isMobile = false
  // 立即回调一次（取当前值），之后变化时自动重新回调
  ctx.ui.useMedia('(max-width: 640px)', (v) => { $.isMobile = v })

  return (props) => (
    <div class={$.isMobile ? 'wf-stack' : 'wf-row'}>
      {!$.isMobile && <Sidebar />}
      <Content />
    </div>
  )
}
```

`callback` 在 mount 时立即执行一次，之后断点变化时再次执行。赋值给 `$` 的属性自动触发渲染。

#### `ctx.ui.useBreakpoint(callback)` — 命名断点

预设三个断点名称：`mobile`（<640px）、`tablet`（640-1023px）、`desktop`（≥1024px）：

```tsx
const Layout = (_init, ctx) => {
  const $ = ctx.ui.$()
  ctx.ui.useBreakpoint((vp) => { $.vp = vp })

  return (props) =>
    <div class={`sidebar-${$.vp}`}>
      {$.vp === 'mobile' ? <BottomNav /> : <SideNav />}
      {$.vp === 'mobile' ? <MobileContent /> : <Content />}
    </div>
}
```

也支持自定义断点：

```tsx
ctx.ui.useBreakpoint(
  { narrow: '(max-width: 480px)', wide: '(min-width: 1200px)' },
  (vp) => { $.size = vp },
)
```

#### `ctx.ui.usePopupPosition(options)` — 弹层坐标跟随

解决弹出层（Popover / Tooltip / Dropdown / DatePicker 等）在 **页面滚动 / 窗口缩放后不跟随触发元素** 的问题。基于 `position: fixed` + `getBoundingClientRect()`（视口坐标）的弹层，滚动后坐标需要重算——本 API 用全局 scroll/resize 监听（rAF 节流）自动重算并精准刷新当前组件。

```tsx
const DatePicker = (_init, ctx) => {
  let show = false
  let inputEl: HTMLElement | null = null
  let prevOpen = false

  // mount 阶段注册：scroll/resize 时自动重算 pos
  const pos = ctx.ui.usePopupPosition({
    el: () => inputEl,                  // 锚定元素（ref 保存）
    isOpen: () => show,                 // 弹层是否显示
    compute: (r) => ({ top: r.bottom + 4, left: r.left }),  // rect → 坐标
  })

  return (props) => {
    const isOpen = show
    // 打开瞬间算一次初始坐标（受控/非受控统一覆盖）
    if (isOpen && !prevOpen) pos.refresh()
    prevOpen = isOpen

    return h('div', {}, [
      h('input', {
        ref: (el) => { inputEl = el as HTMLElement },
        onClick: () => { show = !show; ctx.ui.render() },
      }),
      isOpen ? h('div', { style: { top: pos.top, left: pos.left } }) : null,
    ].filter(Boolean))
  }
}
```

要点：

- `pos` 是稳定对象，render 闭包直接读取 `top/left/width`，滚动重算原地更新，无需重新绑定
- `pos.refresh()` 只重算不渲染——配合打开路径上已有的 `render()`，避免重复渲染
- 监听是**全局单例**（capture 捕获所有嵌套滚动容器 + rAF 节流），按组件 selfId 注册，组件多时开销 O(1)
- `compute` 是纯函数（rect → 坐标），可单独单测

已内置接入的组件：**Popover / Tooltip / Dropdown / DatePicker / Chart**（tooltip）——它们的弹出层在页面滚动、嵌套容器滚动、窗口缩放时都会自动跟随触发元素，无需额外配置。

#### `ctx.ui.usePopup(options)` — 弹层组合器（推荐：移动端友好由构造保证）

`usePopupPosition` 的**上层封装**：把弹层组件的完整生命周期（打开状态 + 触发 + Escape + 外部点击 + 定位/视口 clamp + portal）收敛成一个原语。弹层组件用它替代手写样板，**移动端行为自动正确**：

- **hover 触发在触屏自动降级为 tap**（内部 `matchMedia '(hover: hover)'` 判定）
- **Escape 关闭是 document 级**——焦点在 portal 弹层内按 Escape 也能关
- **外部点击关闭**（document mousedown，点弹层内部不关）
- **宽度自动 clamp 视口**（≤ `100vw - 32px`，375px 屏不横向溢出）
- **定位 + 视口夹紧**（复用 `usePopupPosition`，超高/超宽面板平移回视口）
- 支持受控（`open`/`onOpenChange`）、动态 props（`placement`/`trigger`/`openDelay` 支持 getter）

```tsx
const Tooltip = (_init, ctx) => {
  let show = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el) => { wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: 'hover',            // 触屏自动降级 tap
    placement: () => latestPos,  // getter：动态读最新 props
    el: () => wrapEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.ui.render() },
    width: 320,                  // 自动 clamp 视口
    disabled: () => disabled,
    openDelay: () => delay,      // hover 延迟（HoverCard 用）
  })

  return (props) => h('div', { ref: wrapRef, ...popup.wrapProps }, [
    props.children,
    popup.portal(h('div', { class: 'wf-tooltip' }, props.content), 'tooltip'),
  ].filter(Boolean))
}
```

- `popup.wrapProps` — 触发 + Escape + focus 处理，spread 到包装/触发元素
- `popup.portal(content, portalKey)` — 定位 + clamp + portal（挂载 `#__wf_portal`），关闭时返回 null；自动附加 `wf-popup` 基类
- `popup.open` / `popup.setOpen()` — 状态读取与设置

**边界（诚实裁剪）**：Modal/Drawer 全屏对话框不进 `usePopup`（focus-trap/scroll-lock/退场状态机生命周期不同，各自实现）。

已迁移组件：**Tooltip / HoverCard / Popover / Dropdown / Menubar / Mentions / Cascader / ContextMenu**（长按双通道）。

#### `ctx.ui.useHoverCapable()` / `useLongPress()` / `useVisualViewport()` — 移动端原语

- **`useHoverCapable()`** — 设备是否支持 hover（`matchMedia '(hover: hover)'`，mount 期一次判定）。hover 触发组件用它降级 tap。

```ts
const canHover = ctx.ui.useHoverCapable()
// canHover=false（触屏）→ 用 tap 打开而非 mouseenter
```

- **`useLongPress({ onLongPress, duration })`** — 长按手势：`pointerdown` 按住 `duration`（默认 500ms）触发，提前松开/位移 >10px 取消，`contextmenu` 兼容。返回的 props spread 到目标元素。ContextMenu 已内置桌面右键 + 触屏长按双通道。

```ts
const press = ctx.ui.useLongPress({ onLongPress: (e) => openAt(e), duration: 500 })
return h('div', { ...press }, children)  // onPointerDown/Up/Leave/Move + onContextMenu
```

- **`useVisualViewport()`** — 可视视口跟踪（`visualViewport` resize/scroll 监听）：虚拟键盘弹起/页面缩放时自动更新并 dirty。返回响应式 `{ height, offsetTop, keyboardOpen }`；无 `visualViewport` 环境（桌面）降级 `innerHeight`。fixed 底部栏防键盘遮挡用（AiChat `raiseOnKeyboard` prop）。

```ts
const vv = ctx.ui.useVisualViewport()
// vv.keyboardOpen → 输入区 fixed 抬升到键盘上方
```

#### `ctx.ui.selfId(name)` — 跨组件精准刷新

用于全局事件通知、Portal 远程控制、兄弟组件协调等场景——绕过多层 props 传递，直接按 ID 刷新目标组件：

```tsx
// 组件 A：mount 阶段注册自定义 ID
const StatsPanel = (_init, ctx) => {
  ctx.ui.selfId('stats')
  const $ = ctx.ui.$()
  $.data = []
  return (props) => h('div', {}, String($.data.length))
}

// 组件 B（或其他任何地方）用 ID 精准刷新
ctx.ui.render(['stats'])        // 同步刷新
// 或：ctx.ui.dirty(['stats'])   // 异步批处理版本
```

**语义**：

- 必须在 **mount 阶段**调用（组件初始化时），注册后组件即可被 `render(['id'])` / `dirty(['id'])` 精准定位
- **同名冲突直接抛错**，每个自定义 ID 必须全局唯一
- 配合 `selfId` 注册的组件在跨组件场景下无需把刷新逻辑层层传 props

#### CSS 层响应式（不碰 JS）

配合 `weifuwu/layout` 的断点变体，纯 CSS 实现布局方向切换：

```html
<!-- 小屏堆叠，桌面并排 -->
<div class="wf-stack wf-stack@md"></div>

<!-- 小屏隐藏侧栏 -->
<aside class="wf-hidden wf-block@md"></aside>
```

可用断点变体：

| 原语 | 变体 | 效果 |
|------|------|------|
| `wf-stack` | `@sm` `@md` `@lg` | 断点以上改为横向排列 |
| `wf-row` | `@sm` `@md` `@lg` | 断点以上保持横向 |
| `wf-hidden` | `@sm` `@md` `@lg` | 断点以上隐藏 |
| `wf-block` | `@sm` `@md` `@lg` | 断点以上显示 |

断点尺寸：`--wf-bp-sm: 640px` / `--wf-bp-md: 768px` / `--wf-bp-lg: 1024px` / `--wf-bp-xl: 1280px`

**移动端专用工具**（`weifuwu/layout`）：

| 工具 | 效果 |
|------|------|
| `wf-popup` | 浮层基类：宽度视口 clamp（`min(var(--wf-popup-max, 480px), calc(100vw - 32px))`）——手动浮层防横向溢出 |
| `wf-safe-bottom` / `wf-safe-top` | iOS 安全区：`padding: env(safe-area-inset-bottom/top)`（刘海屏/Home 条） |
| `@media (pointer: coarse)` 44px | 触屏命中区：button/input/select 全局覆盖；非 button 交互元素由 style-audit 规则强制登记 |

> **移动端开发指南**：断点体系 / 44px 命中区纪律 / usePopup / 手势原语 / safe-area / 验收清单 → [`docs/mobile.md`](mobile.md)

### `ctx.ui.dirty()` — 异步标记脏

异步版本，无参 = 当前组件，传参 = 指定组件列表。多次调用合并为一次微任务渲染。`$` 内部就是调 `dirty()`。

与 `render()` 的区别：`dirty()` 是**异步**（微任务批量合并，同帧多次调用只渲染一次），`render()` 是**同步**（立即执行 VDOM diff + patch）。日常 UI 状态用 `$` 或 `dirty()`，需要立即拿到最新 DOM（测量/动画/第三方库）时用 `render()`。

### `ctx.ui.render()` — 同步强制渲染

与 `dirty()` 的微任务批量不同，`render()` 是**同步执行**的。调用后立即执行 VDOM diff + patch，DOM 立刻更新。无参时只刷新当前组件，传参时可精准刷新指定组件。

**何时必须用 `render()`**：

```tsx
// 1. DOM 测量（读取 offsetHeight/scrollWidth 等）
// 用 ref 在 DOM 创建后操作
ref: (el) => {
  if (!el) return
  el.style.height = 'auto'
  ctx.ui.render()
  const h = el.offsetHeight
  el.style.height = h + 'px'
}

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
// 自动：$.x = val — 微任务批量，绑定当前组件
const $ = ctx.ui.$()
$.count++
$.name = 'hello'         // 多次赋值合并为一次渲染

// 手动：ctx.ui.render() — 同步，无参=当前，传参=指定
let count = 0
count++
ctx.ui.render()          // DOM 立刻更新
ctx.ui.render(['stats']) // 精准刷新指定组件

// 异步：ctx.ui.dirty() — 微任务批量，同 render() 作用域
ctx.ui.dirty()
ctx.ui.dirty(['stats'])  // 批处理合并
```

**性能说明**：
- `$.x = val` 和 `dirty()` 都是微任务批量合并
- `render()` 从 dirty 组件**向下**遍历（scope render），兄弟组件不遍历
- **三态 skip 自动优化**：组件重新渲染时，框架自动检查三个维度：
  - **props**（含 children 元素级比较）——值没变则不渲染
  - **`$` 状态**——没被 dirty 标记则不渲染
  - **ctx 版本**——ctx 没变化则不渲染
  三个条件全部满足时跳过整个子树（零 `_render` 调用、零 `patchValue` 遍历）
- **lastIndex keyed diff**：列表 diff 采用正向 lastIndex 算法（React 同款），顺序不变时零 `insertBefore`。对比传统的逆序循环全量移动，DOM 修改从 O(N) 降到 O(0)。
- 示例：DemoButton 点击一次，DOM 修改从 34 次降到 **1 次**（仅变更文本节点的 `textContent`）

### 实践建议

**组件库**（可分享组件）推荐手动模式：

```tsx
const DatePicker = (_init, ctx) => {
  let show = false             // let 不触发渲染
  return (props) =>
    h('input', {
      onClick: () => { show = true; ctx.ui.render() }
    })
}
```

行为只由 `render()` 显式控制，不依赖 `$`，测试中 `render()` 直接 mock 为空函数。

**业务层**推荐自动模式：

```tsx
const OrderPage = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.orders = []                // $ 赋值自动触发渲染
  $.loading = false
  return (props) => h('div', {}, $.loading ? h(Spinner) : h(OrderList, { orders: $.orders }))
}
```

省事、安全、`$` 绑定所属组件不波及兄弟。

同一个组件内可以按变量混用两种模式：需要渲染的用 `$`，不需要的用 `let`。

### VDOM diff 优化机制

weifuwu 的 VDOM 在每次 render 时自动执行**三态 skip 判定**，减少不必要的组件渲染和 DOM 操作：

```
canSkip = (props 没变) AND ($ 没脏) AND (ctx 版本一致)
          ↑ 值级浅比较    ↑ VNode dirty 标记  ↑ 全局版本号
```

三个维度各自独立判断，AND 合并。任何一个维度说

---

## 条件与列表

使用原生 JS 控制流：

```tsx
// 条件
{cond ? <A /> : <B />}
{cond && <A />}

// 列表 — 必须指定 key
{items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

---

## ref 管理 DOM

使用 `ref` prop 获取元素引用，适合管理第三方库或读取 DOM：

```tsx
const Timer: Component = (_init, ctx) => {
  let timer: ReturnType<typeof setInterval> | undefined

  return (props) =>
    h('div', {
      ref: (el) => {
        if (el) {
          timer = setInterval(() => console.log('tick'), 1000)
        } else {
          clearInterval(timer)
        }
      },
    }, 'Timer')
}
```

`ref` 在元素创建时调用 `ref(el)`，元素移除时调用 `ref(null)`。
`ref` 不接受返回值，清理逻辑直接在 `else` 分支处理。

对于**内嵌元素**（非根元素），直接在目标元素上放 `ref`：

```tsx
return h('div', {},
  h('input', {
    type: 'text',
    ref: (el) => el?.focus(),
  })
)
```

### 异步组件

在 mount 阶段发起请求，数据通过 `$.x = val` 自动触发渲染：

```tsx
const UserProfile: Component = (initProps, ctx) => {
  const $ = ctx.ui.$()
  $.loading = true

  fetch(`/api/user/${initProps.id}`)
    .then(r => r.json())
    .then(user => { $.user = user; $.loading = false })

  return (props) =>
    $.loading
      ? h('div', {}, '加载中...')
      : h('div', {}, $.user?.name ?? '')
}
```

### asyncComponent 工厂（async 组件）— 同步式数据声明

`async (ctx) => (initProps, ctx) => (props) => VNode` — 工厂层（async，只执行一次并缓存）声明数据/加载代码，mount/render 保持同步。数据经闭包注入组件，渲染无 loading 分支：

```tsx
import { asyncComponent } from 'weifuwu/client'

const UserProfile = asyncComponent(async (ctx) => {
  const user = await ctx.data.get(`/api/user/${ctx.params.id}`)
  return (_init, ctx) => {
    const $ = ctx.ui.$()
    $.liked = false                        // 客户端状态（交互后变化）
    return (props) =>
      h('div', {},
        h('p', {}, user.name),             // 服务端状态（闭包，SSR 进 HTML）
        h('button', { onClick: () => $.liked = !$.liked }, $.liked ? '❤️' : '🤍'),
      )
  }
})
```

- **客户端**：首次渲染占位 → 工厂 resolve 后整树重渲染补全（SPA）；数据经 `ctx.data` 缓存（hydration 时从 `__DATA__` 同步命中，不重跑请求）
- **服务端**：`ctx.ui.ssr()` 直接 await 工厂 → 数据进 HTML（无占位）
- 工厂缓存绑定页面上下文：路由导航/登录登出时自动失效，工厂以新 ctx 重新执行
- 会变的数据：初始值 seed 自服务端数据（`$.count = data.count`），交互改 `$`；初始状态必须确定性（禁止 `window.innerWidth` 直接初始化 → SSR/hydration mismatch）

---

## 前端类型

```tsx
import type { VNode, VNodeType, Component, WfuiContext, AppMiddleware, RouteDef } from 'weifuwu/client'
import type { ApiClient, ApiOptions, ApiRequestOptions, ApiError } from 'weifuwu/client'
import type { AuthClient, AuthOptions } from 'weifuwu/client'
import type { ErrorBoundaryProps } from 'weifuwu/client'
import type { I18nOptions, I18nState, LocalePackage } from 'weifuwu/client'
import type { PopupPositionOptions, PopupPosition } from 'weifuwu/client'
import type { ConfirmProps, ConfirmOptions } from 'weifuwu/components'
import type { ToastOptions, ToastPosition } from 'weifuwu/components'
import type { RouterOptions } from 'weifuwu/client'
```

| 类型 | 说明 |
|------|------|
| `VNode` | `{ type, props, key? }` |
| `VNodeType` | `string \| Component \| typeof Fragment` |
| `Component<P>` | `(initProps: P, ctx: WfuiContext) => (props: P) => VNode \| null` |
| `WfuiContext` | `{ ui, route?, app?, ws?, api?, auth?, i18n?, confirm?, toast?, [key]: unknown }` |
| `AppMiddleware` | `(ctx: WfuiContext) => WfuiContext` |
| `RouteDef` | `{ path, component?, layout?, children?, auth?, title? }` |
| `ApiClient` | `{ get, post, put, patch, delete }` |
| `ApiError` | `class { status, body } extends Error` |
| `AuthClient` | `{ token, user, isLoggedIn, login, logout, setUser, refresh }` |
| `I18nOptions` | `{ locale?, messages?, components? }` |
| `I18nState` | `{ locale, t, setLocale, components }` |
| `ErrorBoundaryProps` | `{ fallback?, children? }` |
| `ConfirmProps` | `{ open?, title?, message?, confirmText?, cancelText?, variant?, width?, onConfirm?, onCancel? }` |
| `ConfirmOptions` | `{ title?, confirmText?, cancelText?, variant?, width? }` — 命令式 ctx.confirm 选项 |
| `ToastOptions` | `{ position?, duration?, max? }` — 命令式 ctx.toast 配置 |
| `PopupPositionOptions` | `{ el, isOpen, compute }` — 弹层位置跟踪配置（见 usePopupPosition） |
| `PopupPosition` | `{ top, left, width?, refresh }` — 弹层位置跟踪器 |

---

