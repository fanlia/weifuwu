# 自定义组件开发指南

> 从 docs/custom-components.md 迁移（2026-08）——自定义组件全流程：骨架/状态/弹层/对话框/AI/异步/类型/测试/受控/动画/浏览器纪律/样式纪律。
> 逐步指南配套：[选型](choose.md) · [组件模型](component-model.md) · [质量标准](quality.md)
>
> ⚠️ **先读 [组件编写标准（强制）](component-standards.md)**——L1 类型/L2 运行时检测/L3 契约测试
> 三层强制——本文是流程，标准是红线。

# 自定义组件开发指南


> ⚠️ **weifuwu/client 已并入 `weifuwu/ui-dom`**（`src/client/` 已删除）——前端运行时唯一入口为 `weifuwu/ui-dom`，见 [ui-dom 指南](ui-dom-guide.md)。
> 用 weifuwu/ui-dom 写自己的组件——与内置组件同权：同渲染引擎、同弹层原语、同类型安全。
> 前置：[前端概念](frontend.md)（两阶段模型/ctx.ui）+ [组件速查](components-guide.md)。

---

## 0. 最小骨架

```tsx
import { h, type Component } from 'weifuwu/ui-dom'

// Component<P, C>：P = props（JSX 自动推断），C = ctx 注入依赖（默认 {}）
const Badge: Component<{ text: string; color?: string }> = async () =>
  async (props) => h('span', { class: 'my-badge', style: { color: props.color } }, props.text)
```

- 两阶段：外层 `(initProps, ctx) => …` 只执行一次（mount），内层 `(props) => Promise<VNode>` 每次渲染执行（renderFn 强制异步——可 await 数据）
- 有状态组件用闭包 `let` + 事件里 `ctx.ui.render()`（render-only）；不需要渲染的状态不调 `render()`

### mount 与 render 的职责（事件函数写在哪层）

| | mount（外层工厂，一次） | render（内层 renderFn，每次） |
|---|---|---|
| 职责 | 初始化状态 / 订阅 / 定时器 / **定义依赖稳定引用的回调** | 读最新 props / 派生数据 / **定义依赖它们的回调** / 输出视图 |
| 可访问 | `initProps`（首次）、`ctx`、mount `let`、稳定 handle | 最新 `props`、mount 闭包、`ctx` |
| 事件函数 | **只依赖稳定引用**（ctx / mount let / 稳定 handle 如 useChat 的 `chat`）→ mount 定义，天然引用恒等 | 依赖最新 props / 派生状态（如 Table 的 `rowSelection`、Menu 的 `openSet`）→ render 内定义（闭包捕获最新值） |

```tsx
const AiChat = async (initProps, ctx) => {
  const chat = initProps.chat           // 稳定 handle（useChat 返回，引用不变）
  const onSend = () => chat.send()      // ✅ mount 定义：只依赖稳定引用——引用恒等，零重绑
  return async (props) => {
    const onSelect = (k: string) => props.onSelect?.(k)   // ✅ render 定义：依赖最新 props——闭包捕获当前值
    return h('button', { onClick: onSelect }, '选')
  }
}
```

**规则**：回调只依赖 ctx / mount `let` / 稳定 handle → **mount 定义**（天然稳定，不重绑）；依赖最新 props / 派生数据 → **render 内定义**（闭包捕获最新值；引用变化导致事件重绑是**正确性要求**——必须读最新状态，框架不做稳定引用魔法）。

## 1. 有状态组件

```tsx
const Toggle: Component = async (_init, ctx) => {
  let on = false        // 普通对象状态（render-only：无 $ Proxy）

  return async (props) => h('button', {
    class: 'my-toggle',
    onClick: () => { on = !on; ctx.ui.render() },   // 改状态后显式 render()
  }, on ? '开' : '关')
}
```

| 状态类型 | 存放位置 | 触发渲染 |
|---------|---------|---------|
| 组件内部状态 | 闭包 `let` | 改后调 `ctx.ui.render()` |
| 共享状态 | `createStore` + `ctx.ui.useExternal()` | store 变更自动 |
| 内部缓存 | 闭包 `let` | 不触发 |

## 2. 带弹层的组件（最高频的自定义场景）

用 `ctx.ui.openPopup`——命令式弹窗（toast 心智——调用点构建内容——内核
  自管理挂载/更新/卸载——返回 handle `{ close, update, open }`——定位/外部点击
  /Escape/视口夹紧/presence/mask 全内置）——组件输出纯业务（无槽）

```tsx
const MyPopover: Component<{ content: string }> = async (_init, ctx) => {
  let open = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }
  let handle: PopupHandle | null = null

  // 句柄同步样板（受控 + 内容更新 + 关闭清理——每次渲染恒调用）
  const syncPopup = (content: string) => {
    if (open && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,     // **anchor 必传**（触发区是锚点——否则被当外部点击关闭）
        content: () => h('div', { class: 'wf-panel' }, content),
        onClose: () => { handle = null; open = false; ctx.ui.render() },
      })
    else if (!open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(h('div', { class: 'wf-panel' }, content))
  }

  return async (props) => {
    syncPopup(props.content)
    return h('span', {
      class: 'anchor', ref: wrapRef,
      onMouseEnter: () => { open = true; ctx.ui.render() },   // hover 触发（组件自管）
      onMouseLeave: () => { open = false; ctx.ui.render() },
    }, props.children)
  }
}
```

> **受控弹层**：open 状态由父组件独占（props.open + onOpenChange）——组件内部
> 只做句柄同步；非受控（无 open prop）时组件自管状态（`let open` + 触发事件）。
> **关闭路径**：内核 onClose 回调（外部点击/Escape 触发）同步句柄 + 状态——
> 组件无需显式清空（内核 dispose 全权）。

## 3. 对话框类组件（Modal 系）

全屏对话框（焦点 trap + 滚动锁 + 退场动画）是 openPopup 的**会话级模态模式**
（`presence/trapFocus/lockScroll/positioning: 'none'`——Modal/Drawer 同款）：

```tsx
const MyDialog: Component<{ open: boolean; onClose: () => void }> = async (_init, ctx) => {
  let handle: PopupHandle | null = null
  return async (props) => {
    // 命令式同步（受控 + 退场：关闭前先渲染 exit class → close 播动画）
    if (props.open && !handle)
      handle = ctx.ui.openPopup({
        key: 'dialog',
        presence: true,      // 退场状态机（open → exit → closed + animationend）
        trapFocus: true,     // 焦点 trap（面板挂载锁定/卸载归还）
        lockScroll: true,    // 滚动锁（打开锁 / 卸载释放）
        positioning: 'none', // 组件自定义定位（.wf-modal inset:0 居中）
        closeOnOutside: false, closeOnEscape: false, // 关闭语义组件自控
        content: () => h('div', { class: 'wf-overlay', onClick: (e: any) => { if (e.target === e.currentTarget) props.onClose() } },
          h('div', { class: `wf-modal ${props.open ? 'wf-modal--enter' : 'wf-modal--exit'}`,
            onKeyDown: (e: any) => { if (e.key === 'Escape') props.onClose() } }, props.children)),
        onClose: () => { handle = null },
      })
    else if (!props.open && handle) { handle.update(rootVn); handle.close(); handle = null }
    else if (handle) handle.update(rootVn)
    return null   // 主树零输出
  }
}
```

> **ref 接线**：`trapFocus`/`lockScroll`/presence 退场监听全部由 openPopup 内核接线
> （面板根元素自动挂 ref——组件层无需手挂）——低层原语已收编为内核实现（不对外导出）。
> `animateOut` 仍可用（非弹窗动画场景）。

## 4. AI 组件

会话语义由 `ctx.ui.useChat` 提供（消息/流式/工具/审批/stop/retry 全封装），返回的 handle 与 `$` 同一容器：

```tsx
const ChatPanel: Component = async (_init, ctx) => {
  const chat = ctx.ui.useChat({
    url: '/api/chat',
    approveUrl: '/api/approve',   // HITL 审批上行（缺省 approve() 只清卡片）
    body: (messages) => ({ messages, mode: 'agent' }),
  })

  return () => h('div', { class: 'chat' },
    h(AiChat, { chat }),                    // 标准界面：输入/消息/流式/工具卡全内置
    h('button', { onClick: () => chat.send() }, chat.streaming ? '…' : '发送'),
  )
}
```

**共享 handle 给子组件**（如 `<AiChat chat={chat} />`）：会话 handle 带 `subscribe(cb)`——子组件 mount 期 `ctx.ui.useExternal(initProps.chat)` 自订阅（AiChat 已内置），会话状态变化自动重渲染订阅组件。

## 5. 异步组件（数据声明在工厂层）

组件 = 函数，async 组件 = async 函数——**不需要包装**，签名与同步组件一致：

```tsx
const UserCard = async (initProps, ctx) => {
  const user = await ctx.data.get(`/api/user/${initProps.userId}`)  // 三场景：SSR→__DATA__ / hydration 种子 / SPA fetch
  let liked = false
  return async (props) => h('div', {}, user.name, h('button', { onClick: () => { liked = !liked; ctx.ui.render() } }))
}
```

- 渲染器按「返回值是 Promise」判别：主路径 `buildVNode` await 全部（无占位）；运行时首次挂载的 async 组件在 buildVNode 阶段 await（无占位/补全回调）；SSR 直接 await
- 工厂按实例执行；**数据必须走 ctx.data**（缓存+并发合并，重复执行零成本）；禁止副作用裸写工厂
- **个性化数据不进 ctx.data**（SSR 会序列化给所有客户端）——留在客户端 `let` + fetch + `render()`

## 6. 类型纪律（编译期防线）

```tsx
const Badge: Component<{ variant: 'primary' | 'muted' }> = async () =>
  async (props) => h('span', { class: `badge-${props.variant}` }, props.children)

// 负例：variant 传错 → tsc 报错（@ts-expect-error 是类型流测试的写法）
// @ts-expect-error variant 不允许 'bogus'
const bad: { variant: 'primary' | 'muted' } = { variant: 'bogus' }

// ctx 注入声明（C 泛型）：声明了才能用，未声明编译期报错
const Page: Component<{}, { api: ApiInjected['api'] }> = async (_init, ctx) => {
  ctx.api.get('/x')
  return () => null
}
```

| 规则 | 违反后果 |
|------|---------|
| `Component<P, C>` 类型化（禁 `_init: any`） | 编译期不可查 |
| 受控 props 必须配回调 | 交互静默失效（组件 console.warn） |
| ref 用 `ctx.ui.useStableRef`（禁内联 ref） | 清理逻辑每次渲染误触 |
| 初始状态确定性（禁 `window.innerWidth` 直接初始化） | SSR/hydration mismatch |
| 小尺寸按钮固定 min/max-height | 被全局 36px 撑成竖条 |

## 7. 测试写法

**官方测试原语 `weifuwu/ui-dom/testing`**（子路径，随包发布）——自研组件测试用官方工具，不手抄：

```tsx
import { renderVNode, mountComponent, findByClass, createTestCtx } from 'weifuwu/ui-dom/testing'
// 仓库内开发用相对路径：from '../../ui-dom/testing.ts'

const vnode = renderVNode(Toggle, {}, createTestCtx())
// 断言 vnode 结构（子组件 VNode.type 是组件函数，不是标签名）

// 交互流转（内部 let 状态）用 mountComponent（同实例 re-render）：
const render = mountComponent(Toggle, {}, createTestCtx())
render() // 初始
// ... 触发点击/输入 ...
render() // 重渲染，状态保留
```

- 弹层组件：`createPopupMock(isOpen)` 注入 `createTestCtx({ ui: { openPopup: (opts) => popup } })`
- 类型流测试：`@ts-expect-error` 负例（见 [type-flow.test.ts](../../src/components/type-flow.test.ts)）
- 组件测试跑在 node --test；DOM 事件级测试需 `document.body.appendChild(container)`

## 8. 受控组件标准

新受控组件**必须**用 `ctx.ui.useControlled`（受控判定 + 缺回调 warn 一次 + 非受控内部状态跨渲染保持）：

```tsx
const CollapseItem: Component<{ active?: boolean; onChange?: (v: boolean) => void }> = async (_init, ctx) => {
  return async (props) => {
    const ctrl = ctx.ui.useControlled<boolean>({ value: props.active, onChange: props.onChange, name: 'CollapseItem' })
    return h('button', {
      onClick: () => ctrl.setValue(!(ctrl.value ?? false)),   // 受控走 onChange；非受控内部状态
    }, (ctrl.value ?? false) ? '开' : '关')
  }
}
```

> 多受控维度组件（Tree 的 expandedKeys+checkedKeys）不适用单值 useControlled——保留手工受控判定（参考 Tree.ts），warn 文案与 useControlled 保持一致。

## 8.5 动画（4 层能力）

| 层 | 原语 | 用法 |
|----|------|------|
| CSS 语言 | Token（`--wf-dur-*`/`--wf-ease-*`/`--wf-motion-*`）+ `--enter`/`--exit` 成对 | 组件动画统一引用 Token，禁硬编码 |
| 生命周期 | `useAnimationEnd(cb, { once })`（完成回调）/ `usePresence({ name })`（显隐状态机）/ `animateOut(el, done)`（命令式退场） | 入场 settle / 退场延迟卸载 / 命令式播动画 |
| 数值驱动 | `useTween(target, { duration, ease })`（补间）/ `useInView` / `useScrollPosition` | count-up / 进入视口播 / 滚动联动 |
| 偏好感知 | `useReducedMotion()` | JS 动画（rAF/tween）侧跳过；CSS 动画 `_base.css` 已全局降级 |

**纪律**：组件内动画事件监听**唯一入口是 `useAnimationEnd`**——禁直接 `addEventListener('animationend')`（DatePicker 已收敛）；退场优先 `usePresence`（声明式状态机）或 `animateOut`（命令式）。

## 8.6 浏览器环境纪律（ctx.browser）

> **自定义组件禁止直接引用 window/document**——统一经 `ctx.browser`：
> SSR 安全（shim 安全默认）+ 测试 mock 单点 + 环境差异隔离。

```tsx
const MyComp: Component = async (_init, ctx) => {
  // mount 层取 browser（ctx.browser 优先，测试/无注入环境 fallback jsdom）
  const browser = ctx.browser ?? createClientBrowser()
  return async (props) =>
    h('button', {
      onClick: () => {
        // 复制/查询/存储/滚动——全部经 browser
        void browser.copyText('hello')
        const el = browser.byId('target')
      }
    })
}
```

**规则**：
- 拖拽统一 `ctx.ui.useDragDrop`（drop 侧 dropProps + drag 侧 dragProps：draggable/
  onDragStart/onDragEnd）——**dragstart 期间禁止重渲染**（渲染替换源元素中断拖拽；
  身份/位置在渲染期闭包绑定，拖拽视觉高亮用 CSS :hover）
- 复制统一 `browser.copyText`（clipboard + 降级——勿自建 textarea+execCommand）
- 键盘导航用 `browser.activeElement()`（勿 document.activeElement）
- 存储用 `browser.storageGet/Set`（勿 localStorage 裸调）
- SSR 场景（render/mount 期）绝对不碰环境 API（shim 返回 null——需防御）

## 9. 样式纪律（style-audit 强制）

- 动效用 Token：`--wf-dur-*` / `--wf-ease-*` / `--wf-motion-*`（禁硬编码）
- 语义色用 `-text` 变体（700 级）；实心填充文字用 `--wf-color-on-brand`；遮罩 `--wf-overlay`
- 图标用 `Icon` 组件（禁裸文本字形 ✕✓⚠▲）
- 触屏（coarse pointer）自动 44px 命中区

---

## 内置组件 = 最佳实践范本

| 想要的能力 | 参考源码 |
|-----------|---------|
| 弹层组合（hover/click/longpress） | [Tooltip.ts](../../src/components/Tooltip/Tooltip.ts) / [ContextMenu.ts](../../src/components/ContextMenu/ContextMenu.ts) |
| 对话框状态机 | [Modal.ts](../../src/components/Modal/Modal.ts) / [Drawer.ts](../../src/components/Drawer/Drawer.ts) |
| AI 会话 | [AiChat.ts](../../src/components/AiChat/AiChat.ts) |
| 受控 + 键盘导航 | [Collapse.ts](../../src/components/Collapse/Collapse.ts) / [Tabs.ts](../../src/components/Tabs/Tabs.ts) |
| 异步数据 | [UserProfile](../../src/components/Img/Img.ts) 的 factory 模式 |
| 命令式 API（toast/confirm） | [Toast.ts](../../src/components/Toast/Toast.ts) |

## 已知边界（诚实裁剪）

- **引擎自动写入的 DOM 属性（开发者不需要处理，但写自定义组件时会在 DOM 里看到）**：
  - `data-wf-id`——组件实例 id，写到组件输出**每个顶层节点**（多根全部写）——渲染定位/audit/debug 用；存在性可预期，值不可预期（`_wf_N` 引擎分配）
  - `data-wf-key`——数组项 key（显式或默认下标），写到元素项自身 / **组件项穿透到输出每个顶层节点**——列表项身份可见，动态增删重排建议显式 key（默认下标 = 位置复用 + 状态继承）
  - `<!--wf-hole: xxx-->` 占位注释——条件渲染 false/null/true/非法输入的占位节点（`{cond && <X/>}`=false 时 DOM 里有注释而非消失）——不是 bug，是引擎的透明占位
  - SSR 不输出 `data-wf-id`（id 客户端运行时分配）；`data-wf-key` SSR 同步输出
  - 断言/快照测试注意：`outerHTML` 包含这些属性与占位注释；按类选择器/子项数量断言不受影响
- **列表 key 纪律**：渲染的列表是**有内部状态的组件实例 + 动态增删/重排**（如可输入的卡片）→ 必须显式 key（项 id），否则默认下标位置复用会让后续项继承被删项的内部状态；纯元素列表（格子/行/节点 div）默认下标即可——通用列表组件对外提供 `keyBy`（如 `List`）

- `openPopup` 是**统一弹窗能力层**（命令式——toast 心智）：锚定浮层（Tooltip/Popover/Dropdown/Select/AutoComplete/Mentions/Cascader/ContextMenu/NavMenu/Popconfirm/TreeSelect）+ 会话级模态（Modal/Drawer/Confirm——presence/trapFocus/lockScroll/positioning 'none'，Escape 语义留组件层）+ mask 模式（Command/Img preview/Tour）+ positioning 'none' 常驻容器（Toast/Notification）——**全部弹窗单一入口**（组件内部句柄同步样板 ~10 行——anchor 必传）
- **事件监听纪律**：组件库内部浏览器事件监听**统一走 `ctx.ui.useXXX`**——滚动/观察/弹层/对话框/快捷键/拖拽/DnD 全覆盖：
  `useInView`（InfiniteScroll）、`useScrollPosition`（AiChat/Affix/BackTop/VirtualList）、`usePopupPosition`（Affix 阈值重算）、`usePopup`（弹窗统一——ContextMenu 自由定位 + Modal/Drawer 模态模式 + mask 遮罩）、`useGlobalKey`（Command 快捷键/Img preview Escape）、`useDrag`（Resizable）、`useDragDrop`（FileUpload）、`useControlled`/`useStableRef`（状态/ref）
- **唯一保留 usePopupPosition 独立使用**：Affix / Chart（坐标工具——非弹窗组合器，滚动跟随自动）
- `createReactiveState` 已导出：组件外建全局 store（`createReactiveState(() => {})` + `$.__watch(cb)` 订阅）
