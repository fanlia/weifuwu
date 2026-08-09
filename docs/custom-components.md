# 自定义组件开发指南

> 用 weifuwu/client 写自己的组件——与内置组件同权：同渲染引擎、同弹层原语、同类型安全。
> 前置：[前端概念](frontend.md)（两阶段模型/ctx.ui）+ [组件列表](components.md)。

---

## 0. 最小骨架

```tsx
import { h, type Component } from 'weifuwu/client'

// Component<P, C>：P = props（JSX 自动推断），C = ctx 注入依赖（默认 {}）
const Badge: Component<{ text: string; color?: string }> = () =>
  (props) => h('span', { class: 'my-badge', style: { color: props.color } }, props.text)
```

- 两阶段：外层 `(initProps, ctx) => …` 只执行一次（mount），内层 `(props) => VNode` 每次渲染执行
- 不需要状态就不调 `ctx.ui.$()`；需要交互才用

## 1. 有状态组件

```tsx
const Toggle: Component = (_init, ctx) => {
  const $ = ctx.ui.$()        // 深度 Proxy：赋值自动触发渲染（微任务批量）
  $.on = false

  return (props) => h('button', {
    class: 'my-toggle',
    onClick: () => $.on = !$.on,
  }, $.on ? '开' : '关')
}
```

| 状态类型 | 存放位置 | 触发渲染 |
|---------|---------|---------|
| 自动 UI 状态 | `$.xxx` | 赋值自动（微任务） |
| 手动 UI 状态 | 闭包 `let` | 需 `ctx.ui.render()` |
| 内部缓存 | 闭包 `let` | 不触发 |

## 2. 带弹层的组件（最高频的自定义场景）

用 `ctx.ui.usePopup`——一个组合器收敛 open 状态 + 触发（hover→tap 降级/longpress）+ Escape + 外部点击 + 定位/视口 clamp + portal：

```tsx
const MyPopover: Component<{ content: string }> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.open = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: 'hover',          // 触屏自动降级 tap（useHoverCapable 内部判定）
    el: () => wrapEl,          // 锚点
    isOpen: () => $.open,
    setOpen: (v) => { $.open = v },   // $ 赋值自动渲染
    width: 320,                // 自动 clamp 视口
    closeOnOutside: true,      // 外部点击关闭（默认）
    closeOnEscape: true,       // Escape 关闭（默认，document 级——portal 焦点也生效）
  })

  return (props) =>
    h('span', { class: 'anchor', ref: wrapRef, ...popup.wrapProps },
      props.children,
      popup.portal(h('div', { class: 'wf-panel' }, props.content)),
    )
}
```

> **受控弹层**：传 `open` getter + `onOpenChange` 即受控（父组件独占开关）；缺 onOpenChange 时 usePopup 内部 warn 提示。

## 3. 对话框类组件（Modal 系）

全屏对话框（焦点 trap + 滚动锁 + 退场动画）不在 usePopup 范围——用已导出的低层原语组装：

```tsx
import { trapFocus, lockScroll, unlockScroll, animateOut, createPortal } from 'weifuwu/client'

const MyDialog: Component<{ open: boolean; onClose: () => void }> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.phase = 'closed'           // closed | open | exit（退场状态机）
  let panelEl: HTMLElement | null = null

  return (props) => {
    // open 变化 → 进场/退场（简化版；完整状态机参考 src/components/Modal/Modal.ts）
    return createPortal(h('div', {
      class: 'wf-overlay',
      ref: (el) => {
        if (el) { lockScroll(); trapFocus(el) }
        else { unlockScroll() }
      },
      onClick: (e) => { if (e.target === e.currentTarget) props.onClose() },
    }, h('div', { class: 'wf-modal', ref: (el) => { panelEl = el } }, props.children)), document.body)
  }
}
```

> `animateOut(el, done, fallbackMs)`：退场动画（挂 exit 类 → animationend → 回调，兜底防挂死）。
> `trapFocus`/`lockScroll`/`animateOut` 已从 `weifuwu/client` 导出，与 Modal/Drawer 内部同款。

## 4. AI 组件

会话语义由 `ctx.ui.useChat` 提供（消息/流式/工具/审批/stop/retry 全封装），返回的 handle 与 `$` 同一容器：

```tsx
const ChatPanel: Component = (_init, ctx) => {
  const $ = ctx.ui.useChat({
    url: '/api/chat',
    approveUrl: '/api/approve',   // HITL 审批上行（缺省 approve() 只清卡片）
    body: (messages) => ({ messages, mode: 'agent' }),
  })

  return () => h('div', { class: 'chat' },
    $.messages.map((m) => h('div', { class: `msg-${m.role}` }, m.content)),
    h('input', { value: $.input, onInput: (e: any) => $.input = e.target.value }),
    h('button', { onClick: () => $.send() }, $.streaming ? '…' : '发送'),
  )
}
```

**共享 `$` 给子组件**（如 `<AiChat chat={$} />`）：父组件 dirty 不驱动子组件（三态 skip），子组件 mount 期 `initProps.chat.__watch?.(() => ctx.ui.dirty())` 自订阅。

## 5. 异步组件（数据声明在工厂层）

```tsx
import { asyncComponent } from 'weifuwu/client'

const UserCard = asyncComponent(async (ctx) => {
  const user = await ctx.data.get(`/api/user/${ctx.route.params.id}`)  // 工厂层取数（SSR 序列化进 HTML）
  return (_init, ctx) => {
    const $ = ctx.ui.$()
    $.liked = false
    return (props) => h('div', {}, user.name, h('button', { onClick: () => $.liked = !$.liked }))
  }
})
```

- 工厂只执行一次（WeakMap 缓存）；客户端首次渲染占位 → resolve 后整树补全；服务端直接 await（无占位）
- **个性化数据不进 ctx.data**（SSR 会序列化给所有客户端）——留在客户端 `$` + fetch

## 6. 类型纪律（编译期防线）

```tsx
const Badge: Component<{ variant: 'primary' | 'muted' }> = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)

// 负例：variant 传错 → tsc 报错（@ts-expect-error 是类型流测试的写法）
// @ts-expect-error variant 不允许 'bogus'
const bad: { variant: 'primary' | 'muted' } = { variant: 'bogus' }

// ctx 注入声明（C 泛型）：声明了才能用，未声明编译期报错
const Page: Component<{}, { api: ApiInjected['api'] }> = (_init, ctx) => {
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

```tsx
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const ctx = { ui: { $: () => ({}), render: () => {}, dirty: () => {}, useControlled: (o: any) => ({ value: o.value, setValue: o.onChange ?? (() => {}), controlled: o.value !== undefined }) } }
const vnode = renderVNode(Toggle, {}, ctx)
// 断言 vnode 结构（子组件 VNode.type 是组件函数，不是标签名）
```

- 类型流测试：`@ts-expect-error` 负例（见 [type-flow.test.ts](../src/components/type-flow.test.ts)）
- 组件测试跑在 node --test；DOM 事件级测试需 `document.body.appendChild(container)`

## 8. 受控组件标准

新受控组件**必须**用 `ctx.ui.useControlled`（受控判定 + 缺回调 warn 一次 + 非受控内部状态跨渲染保持）：

```tsx
const CollapseItem: Component<{ active?: boolean; onChange?: (v: boolean) => void }> = (_init, ctx) => {
  return (props) => {
    const ctrl = ctx.ui.useControlled<boolean>({ value: props.active, onChange: props.onChange, name: 'CollapseItem' })
    return h('button', {
      onClick: () => ctrl.setValue(!(ctrl.value ?? false)),   // 受控走 onChange；非受控内部状态
    }, (ctrl.value ?? false) ? '开' : '关')
  }
}
```

> 多受控维度组件（Tree 的 expandedKeys+checkedKeys）不适用单值 useControlled——保留手工受控判定（参考 Tree.ts），warn 文案与 useControlled 保持一致。

## 9. 样式纪律（style-audit 强制）

- 动效用 Token：`--wf-dur-*` / `--wf-ease-*` / `--wf-motion-*`（禁硬编码）
- 语义色用 `-text` 变体（700 级）；实心填充文字用 `--wf-color-on-brand`；遮罩 `--wf-overlay`
- 图标用 `Icon` 组件（禁裸文本字形 ✕✓⚠▲）
- 触屏（coarse pointer）自动 44px 命中区

---

## 内置组件 = 最佳实践范本

| 想要的能力 | 参考源码 |
|-----------|---------|
| 弹层组合（hover/click/longpress） | [Tooltip.ts](../src/components/Tooltip/Tooltip.ts) / [ContextMenu.ts](../src/components/ContextMenu/ContextMenu.ts) |
| 对话框状态机 | [Modal.ts](../src/components/Modal/Modal.ts) / [Drawer.ts](../src/components/Drawer/Drawer.ts) |
| AI 会话 | [AiChat.ts](../src/components/AiChat/AiChat.ts) |
| 受控 + 键盘导航 | [Collapse.ts](../src/components/Collapse/Collapse.ts) / [Tabs.ts](../src/components/Tabs/Tabs.ts) |
| 异步数据 | [UserProfile](../src/components/Img/Img.ts) 的 factory 模式 |
| 命令式 API（toast/confirm） | [Toast.ts](../src/components/Toast/Toast.ts) |

## 已知边界（诚实裁剪）

- `usePopup` 覆盖浮层（Tooltip/Popover/Dropdown/Mentions/Cascader/ContextMenu）；**全屏对话框**（Modal/Drawer/Command）用 trapFocus/lockScroll 组装
- **Select/DatePicker** 是 inline/absolute 菜单（自适宽），不迁移 usePopup——菜单直接挂在锚点下
- `createReactiveState` 已导出：组件外建全局 store（`createReactiveState(() => {})` + `$.__watch(cb)` 订阅）
