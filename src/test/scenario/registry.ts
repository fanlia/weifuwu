/**
 * 场景注册表——vdom 引擎 DOM 行为测试（场景 = 路由 = 真实页面）
 *
 * 分层（与契约层互补）：
 * - 契约层（src/test/contract/）——命令流断言（纯数据——node 直跑）
 * - 场景层（本目录）——DOM 行为断言（SSR 服务化 + playwright——真实浏览器）
 *
 * 每个场景 = 一个 vnode 工厂（客户端执行——组件状态真实流转）+ e2e 断言。
 * 场景是引擎真实 bug 的回归样本（§6.3 占位事故 / 组件复用 / keyed 身份 / portal）。
 */
import { h, type Component, type VNode, createStore } from '../../client/vdom/index.ts'
import { createPortal } from '../../client/vdom/core/node/portal.ts'

export interface Scenario {
  id: string
  title: string
  /** 客户端场景入口（组件工厂——mount 后返回 renderFn） */
  render: Component<Record<string, never>, unknown>
  /** SSR 模式：server 端 uiSsr 渲染 HTML（首帧吸收测试）——默认 false（空 root 客户端渲染） */
  ssr?: boolean
}

// ── 场景 11：SSR 吸收（首帧结构对齐复用——焦点/状态保持） ─────────────
// server 端 uiSsr 渲染（SSR HTML 首屏）→ 客户端 uiServe 接管——
// 结构吸收：create 命令复用已有 DOM（同一节点引用——输入焦点保持）。
const SsrAdopt = (_init: Record<string, never>, ctx: any) => {
  let count = 0
  return () =>
    h('div', { class: 'ssr-scene' },
      h('input', { class: 'ssr-input', placeholder: '输入' }),
      h('button', { class: 'ssr-btn', onClick: () => { count += 1; ctx.render() } }, `点击 ${count}`),
      h('span', { class: 'ssr-text' }, 'SSR 内容'),
      false,
      h('b', { class: 'ssr-bold' }, '粗体'),
    )
}

// ── 场景 1：占位同构（§6.3 提交按钮消失事故回归） ──────────────────────
// children 数组含 false 占位（{cond && <X/>}）——render 阶段建占位节点——
// childNodes 长度恒等于 children 长度——diff 不误删兄弟（按钮保留）；
// 空洞 → 真实元素切换（Alert 出现在按钮前——位置正确）。
const HolePlaceholder = (_init: Record<string, never>, ctx: any) => {
  let show = false
  return () =>
    h('div', { class: 'hole-scene' },
      h('span', { class: 'field-item' }, '字段'),
      show ? h('div', { class: 'alert-item' }, '错误提示') : false,
      h('button', {
        class: 'submit-btn',
        onClick: () => { show = true; ctx.render() },
      }, '提交表单'),
    )
}

// ── 场景 2：组件复用（工厂不重跑——内部 let 状态保持） ──────────────────
// 同位置同类型组件复用 _render——父重渲染不重挂——内部状态（count）保持。
const Counter = (_init: Record<string, never>, ctx: any) => {
  let count = 0
  return () =>
    h('button', {
      class: 'counter-btn',
      onClick: () => { count += 1; ctx.render() },
    }, `计数 ${count}`)
}

const ComponentReuse = (_init: Record<string, never>, ctx: any) => {
  let label = '初始'
  return () =>
    h('div', { class: 'reuse-scene' },
      h(Counter, {}),
      h('button', {
        class: 'relabel-btn',
        onClick: () => { label = label + '!'; ctx.render() },
      }, `改标签 ${label}`),
    )
}

// ── 场景 3：keyed 身份跟随（重排状态不漂移） ───────────────────────────
// keyed 列表重排——key 身份跟随内容——内部状态（勾选）不漂移。
const KeyedItem = (_init: Record<string, never>, ctx: any) => {
  let picked = false
  return (props: any) =>
    h('div', { class: 'keyed-item' },
      h('span', { class: 'item-name' }, props.name),
      h('button', {
        class: 'pick-btn',
        onClick: () => { picked = !picked; ctx.render() },
      }, picked ? '已选' : '未选'),
    )
}

const KeyedReorder = (_init: Record<string, never>, ctx: any) => {
  let items = ['甲', '乙', '丙']
  return () =>
    h('div', { class: 'reorder-scene' },
      h('button', {
        class: 'shuffle-btn',
        onClick: () => {
          items = [items[2], items[0], items[1]]
          ctx.render()
        },
      }, '重排'),
      h('div', { class: 'item-list' },
        items.map((name) => h(KeyedItem, { key: name, name })),
      ),
    )
}

// ── 场景 4：portal 往返（弹层增删——#__wf_portal） ─────────────────────
// createPortal 打开 → 内容在 #__wf_portal；关闭 → 移除（不残留）。
const PortalToggle = (_init: Record<string, never>, ctx: any) => {
  let open = false
  return () =>
    h('div', { class: 'portal-scene' },
      h('button', {
        class: 'portal-btn',
        onClick: () => { open = !open; ctx.render() },
      }, open ? '关闭' : '打开'),
      open ? createPortal(h('div', { class: 'portal-content' }, '弹层内容'), 'scenario-portal') : null,
    )
}

// ── 场景 5：diff 就地更新（节点不重建——焦点保持前提） ────────────────
const DiffUpdate = (_init: Record<string, never>, ctx: any) => {
  let label = 'v1'
  return () =>
    h('div', { class: 'diff-scene', 'data-label': label },
      h('button', { class: 'update-btn', onClick: () => { label = 'v2'; ctx.render() } }, '更新'),
      h('span', { class: 'label' }, label),
    )
}

// ── 场景 6：事件重绑（props 变化 → 旧 handler 解绑——引用比较） ────────
const EventsScene = (_init: Record<string, never>, ctx: any) => {
  let version = 0
  let last = ''
  return () =>
    h('div', { class: 'events-scene' },
      h('button', {
        class: 'ev-btn',
        onClick: version === 0 ? () => { last = 'v0'; ctx.render() } : () => { last = 'v1'; ctx.render() },
      }, '触发'),
      h('button', { class: 'swap-btn', onClick: () => { version = 1; ctx.render() } }, '换 handler'),
      h('span', { class: 'ev-last' }, last),
    )
}

// ── 场景 7：Fragment/数组展开（无中间层——DOM 平铺） ───────────────────
const FragmentScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'frag-scene' },
      [h('i', { class: 'f1' }, 'i1'), h('i', { class: 'f2' }, 'i2')],
      h('b', { class: 'f3' }, 'b1'),
    )

// ── 场景 8：ref 生命周期（挂载/卸载——切换触发 ref(null) 清理） ─────────
const RefScene = (_init: Record<string, never>, ctx: any) => {
  let mounted = 0
  let cleaned = 0
  let show = true
  const boxRef = (el: unknown) => { if (el) mounted++; else cleaned++ }
  return () =>
    h('div', { class: 'ref-scene' },
      show ? h('div', { class: 'ref-box', ref: boxRef }, '盒子') : null,
      h('button', { class: 'toggle-btn', onClick: () => { show = !show; ctx.render() } }, '切换'),
      h('span', { class: 'ref-stats' }, `m:${mounted} c:${cleaned}`),
    )
}

// ── 场景 9：navigate（链接拦截 → pushState + 整树替换） ────────────────
const NavigateScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'nav-scene' },
      h('p', {}, '导航场景'),
      h('a', { href: '/scenario/component-reuse', class: 'nav-link' }, '去组件复用场景'),
    )

// ── 场景 10：unmount/dispose（handle.unmount——DOM/portal 完整清理） ─────
const UnmountScene = (_init: Record<string, never>, ctx: any) => {
  let open = false
  return () =>
    h('div', { class: 'unmount-scene' },
      h('button', { class: 'pop-btn', onClick: () => { open = !open; ctx.render() } }, '开弹层'),
      h('button', { class: 'unmount-btn', onClick: () => { (window as any).__scenarioHandle?.unmount() } }, '卸载'),
      open ? createPortal(h('div', { class: 'um-portal' }, '弹层'), 'unmount-portal') : null,
    )
}

// ── 场景 12：useExternal（共享状态——跨组件自动重渲染） ────────────────
const extStore = createStore({ count: 0 })
const ExtA = (_i: Record<string, never>, ctx: any) => {
  const s = ctx.ui.useExternal(extStore)
  return () => h('span', { class: 'ext-a' }, `A:${s.count}`)
}
const ExtB = (_i: Record<string, never>, ctx: any) => {
  const s = ctx.ui.useExternal(extStore)
  return () => h('span', { class: 'ext-b' }, `B:${s.count}`)
}
const ExternalScene = (_i: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'ext-scene' },
      h(ExtA, {}),
      h(ExtB, {}),
      h('button', { class: 'ext-inc', onClick: () => extStore.update((s) => { s.count += 1 }) }, '+1'),
    )

// ── 场景 13：useMedia（媒体查询——视口变化自动重渲染） ──────────────────
// hooks 契约：useMedia 返回快照（非 getter）——必须在 renderFn 内调用
// （每次渲染重新读——change → requestRender → renderFn 重跑 → 新快照）
const MediaScene = (_init: Record<string, never>, ctx: any) =>
  () => {
    const isNarrow = ctx.ui.useMedia('(max-width: 700px)')
    return h('div', { class: 'media-scene' }, h('span', { class: 'media-state' }, isNarrow ? '窄' : '宽'))
  }

// ── 场景 14：usePopup（弹层——portal + 外部点击/Escape 关闭） ──────────
const PopupScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  const triggerRef = (el: unknown) => { if (el) triggerEl = el as HTMLElement }
  const popup = ctx.ui.usePopup({ el: () => triggerEl, placement: 'bottom' })
  return () =>
    h('div', { class: 'popup-scene' },
      h('button', {
        class: 'pop-trigger',
        ref: triggerRef,
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '弹层开关'),
      popup.portal(h('div', { class: 'pop-panel' }, '弹层面板'), 'scenario-popup'),
    )
}

// ── 场景 15：style 只设不删（§6.4——display 残留事故回归） ─────────────
const StyleScene = (_init: Record<string, never>, ctx: any) => {
  let show = false
  return () =>
    h('div', { class: 'style-scene' },
      h('div', { class: 'style-box', style: show ? { display: 'block', color: 'red' } : {} }, '盒子'),
      h('button', { class: 'style-toggle', onClick: () => { show = !show; ctx.render() } }, '切换'),
    )
}

// ── 场景 16：事件非函数守卫（§6.4——diff 路径 warn + 跳过不中断） ──
const GuardScene = (_init: Record<string, never>, ctx: any) => {
  let bad = false
  return () =>
    h('div', { class: 'guard-scene' },
      h('button', {
        class: 'bad-event-btn',
        onClick: bad ? (true as never) : () => { (window as any).__evt = ((window as any).__evt ?? 0) + 1 },
      }, '坏事件'),
      h('button', { class: 'guard-switch', onClick: () => { bad = true; ctx.render() } }, '变坏'),
      h('span', { class: 'guard-ok' }, '渲染正常'),
    )
}

// ── 场景 17：组件 dispose（卸载触发 onUnmount 清理钩子） ───────────────
const DisposeChild = (_i: Record<string, never>, c: any) => {
  c.onUnmount(() => { (window as any).__cleaned = ((window as any).__cleaned ?? 0) + 1 })
  return () => h('span', { class: 'dispose-child' }, '子组件')
}
const DisposeScene = (_init: Record<string, never>, ctx: any) => {
  let show = true
  return () =>
    h('div', { class: 'dispose-scene' },
      show ? h(DisposeChild, {}) : null,
      h('button', { class: 'dispose-toggle', onClick: () => { show = !show; ctx.render() } }, '移除/重挂'),
    )
}

// ── 场景 18：useDragDrop（HTML5 拖拽——数据传递 + 放置回调） ───────────
const DragScene = (_init: Record<string, never>, ctx: any) => {
  let dropped: string | null = null
  const drag = ctx.ui.useDragDrop({
    data: { id: 'item-1' },
    onDrop: (e: DragEvent, data: unknown) => { dropped = JSON.stringify(data); ctx.render() },
  })
  return () =>
    h('div', { class: 'drag-scene' },
      h('div', { class: 'drag-source', ...drag.draggableProps }, '拖我'),
      h('div', { class: 'drag-target', ...drag.dropProps }, '放这里'),
      h('span', { class: 'drag-result' }, dropped ?? '未放置'),
    )
}

// ── 场景 19：useScrollPosition（容器滚动跟踪——rAF 节流事件驱动） ─────
const ScrollScene = (_init: Record<string, never>, ctx: any) => {
  let wrapRef: HTMLElement | null = null
  const pos = ctx.ui.useScrollPosition({ getScroller: () => wrapRef })
  return () =>
    h('div', {
      class: 'scroll-wrap',
      style: { height: '200px', overflow: 'auto' },
      ref: (el: unknown) => { if (el) wrapRef = el as HTMLElement },
    },
      h('div', { class: 'scroll-inner', style: { height: '800px' } }, '长内容'),
      h('span', { class: 'scroll-y' }, `y:${pos.y}`),
    )
}

// ── 场景 20：useChat（AI 流式——NDJSON 分块累积——自动重渲染） ────────
// 契约：messages 是数组替换（非原地）——useExternal mount 闭包失效——
// 用 AiChat 标准模式：subscribe(cb → ctx.render) + 渲染期读 chat.messages
const ChatScene = (_init: Record<string, never>, ctx: any) => {
  const chat = ctx.ui.useChat({ url: '/api/chat' })
  ctx.ui.onUnmount(chat.subscribe(() => ctx.render()))
  return () =>
    h('div', { class: 'chat-scene' },
      h('button', { class: 'chat-send', onClick: () => { void chat.send('你好') } }, '发送'),
      h('span', { class: 'chat-status' }, chat.status),
      h('div', { class: 'chat-msgs' },
        (chat.messages ?? []).map((m: { role: string; content: string }, i: number) =>
          h('p', { class: `msg-${m.role}` }, `${m.role}:${m.content}`)),
      ),
    )
}

// ── 场景 21：i18n 中间件（locale 切换 + t 插值——手动 render 驱动） ────
const I18nScene = (_init: Record<string, never>, ctx: any) => {
  const i18nState = ctx.i18n
  return () =>
    h('div', { class: 'i18n-scene' },
      h('span', { class: 'i18n-hello' }, i18nState.t('hello')),
      h('span', { class: 'i18n-count' }, i18nState.t('count', { n: 42 })),
      h('button', { class: 'i18n-switch', onClick: () => { i18nState.setLocale('en'); ctx.render() } }, 'EN'),
    )
}

// ── 场景 22：useInView（IntersectionObserver——滚动进出视口） ──────────
const InViewScene = (_init: Record<string, never>, ctx: any) => {
  const inView = ctx.ui.useInView(() => (document as any).querySelector('.inview-target'))
  return () =>
    h('div', { class: 'inview-scene' },
      h('div', { class: 'inview-spacer', style: { height: '1000px' } }, '上间隔'),
      h('div', { class: 'inview-target' }, '目标'),
      h('span', { class: 'inview-state' }, inView.isIn ? '可见' : '不可见'),
    )
}

// ── 场景 23：useControlledInput（§5.3 受控输入——内部态 + IME 门控） ──
const ControlledInputScene = (_init: Record<string, never>, ctx: any) => {
  let parentValue = ''
  let lastOnChange: string | null = null
  const input = ctx.ui.useControlledInput({ value: parentValue, onChange: (v: string) => { lastOnChange = v; ctx.render() }, name: 'CtrlInput' })
  return () =>
    h('div', { class: 'ctrl-input-scene' },
      h('input', {
        class: 'ctrl-input',
        value: input.keyword,
        onInput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value
          input.setKeyword(v)
          input.setValue(v)
          ctx.render()
        },
        onCompositionStart: () => input.onCompositionStart(),
        onCompositionEnd: () => input.onCompositionEnd(),
      }),
      h('span', { class: 'ctrl-onchange' }, lastOnChange ?? '无'),
    )
}

// ── 场景 24：useOpen 受控缺回调（§5.2——warn + 静默不可用防护） ────────
const OpenGuardScene = (_init: Record<string, never>, ctx: any) => {
  const open = ctx.ui.useOpen(false, { open: false, onOpenChange: undefined })
  return () =>
    h('div', { class: 'open-guard-scene' },
      h('button', { class: 'open-toggle', onClick: () => open.setOpen(true) }, '尝试打开'),
      h('span', { class: 'open-state' }, open.open ? '开' : '关'),
    )
}

// ── 场景 25：ws 中间件（WebSocket——欢迎 + echo 往返） ─────────────────
const WsScene = (_init: Record<string, never>, ctx: any) => {
  const client = ctx.ws
  // mount 连接 + 订阅（消息 → 状态 → render）
  let received: string[] = []
  ctx.ui.onUnmount(client.onMessage((data: unknown) => {
    received = [...received, String(data)]
    ctx.render()
  }))
  client.connect(`ws://${location.host}/ws`)
  return () =>
    h('div', { class: 'ws-scene' },
      h('button', { class: 'ws-send', onClick: () => client.send('你好') }, '发送'),
      h('div', { class: 'ws-msgs' }, received.map((m: string, i: number) => h('p', { class: 'ws-msg', key: i }, m))),
    )
}

export const scenarios: Scenario[] = [
  { id: 'hole-placeholder', title: '占位同构（§6.3 按钮保留回归）', render: HolePlaceholder },
  { id: 'component-reuse', title: '组件复用（工厂不重跑——状态保持）', render: ComponentReuse },
  { id: 'keyed-reorder', title: 'keyed 身份跟随（重排状态不漂移）', render: KeyedReorder },
  { id: 'portal-toggle', title: 'portal 往返（弹层增删不残留）', render: PortalToggle },
  { id: 'diff-update', title: 'diff 就地更新（节点不重建——焦点保持）', render: DiffUpdate },
  { id: 'events-rebind', title: '事件重绑（handler 引用变化——旧解绑新绑）', render: EventsScene },
  { id: 'fragment-expand', title: 'Fragment/数组展开（DOM 平铺无中间层）', render: FragmentScene },
  { id: 'ref-lifecycle', title: 'ref 生命周期（挂载/卸载清理）', render: RefScene },
  { id: 'navigate', title: 'navigate（链接拦截 → pushState + 整树替换）', render: NavigateScene },
  { id: 'unmount-dispose', title: 'unmount（handle.unmount——DOM/portal 清理）', render: UnmountScene },
  { id: 'ssr-adopt', title: 'SSR 吸收（首帧结构复用——输入焦点保持）', render: SsrAdopt, ssr: true },
  { id: 'use-external', title: 'useExternal（共享状态——跨组件自动重渲染）', render: ExternalScene },
  { id: 'use-media', title: 'useMedia（媒体查询——视口变化自动重渲染）', render: MediaScene },
  { id: 'use-popup', title: 'usePopup（弹层——portal + 外部点击关闭）', render: PopupScene },
  { id: 'style-update', title: 'style 只设不删（display 残留回归——§6.4）', render: StyleScene },
  { id: 'event-guard', title: '事件非函数守卫（warn + 跳过——不中断渲染）', render: GuardScene },
  { id: 'dispose-hooks', title: '组件 dispose（卸载触发 onUnmount 清理钩子）', render: DisposeScene },
  { id: 'drag-drop', title: 'useDragDrop（HTML5 拖拽——数据传递 + 放置）', render: DragScene },
  { id: 'scroll-position', title: 'useScrollPosition（容器滚动跟踪——事件驱动）', render: ScrollScene },
  { id: 'use-chat', title: 'useChat（AI 流式——NDJSON 分块累积）', render: ChatScene },
  { id: 'i18n-switch', title: 'i18n（locale 切换 + t 插值——手动 render）', render: I18nScene },
  { id: 'in-view', title: 'useInView（IntersectionObserver——滚动进出视口）', render: InViewScene },
  { id: 'controlled-input', title: 'useControlledInput（§5.3 受控输入——内部态+IME）', render: ControlledInputScene },
  { id: 'open-guard', title: 'useOpen 受控缺回调（§5.2——warn 防护）', render: OpenGuardScene },
  { id: 'ws-echo', title: 'ws 中间件（WebSocket——欢迎 + echo 往返）', render: WsScene },
]

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
