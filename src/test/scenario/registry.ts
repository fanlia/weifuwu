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
import { SmokeScene } from './components/smoke-registry.ts'
import { Input as CInput, InputNumber as CInputNumber, Textarea as CTextarea, SearchInput as CSearchInput, PasswordInput as CPasswordInput, PinInput as CPinInput, Switch as CSwitch, Checkbox as CCheckbox, RadioGroup as CRadioGroup, Slider as CSlider, Rate as CRate, TagsInput as CTagsInput, SegmentedControl as CSegmentedControl, ToggleGroup as CToggleGroup } from '../../client/components/index.ts'
import { Select as CSelect, AutoComplete as CAutoComplete, Cascader as CCascader, TreeSelect as CTreeSelect, Transfer as CTransfer, ColorPicker as CColorPicker, DatePicker as CDatePicker, Calendar as CCalendar } from '../../client/components/index.ts'
import { Tabs as CTabs, Menu as CMenu, Pagination as CPagination, Table as CTable, Collapse as CCollapse, Accordion as CAccordion, Carousel as CCarousel, Steps as CSteps, List as CList } from '../../client/components/index.ts'

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

// ── 场景 26：placement 矩阵（四方向 + center:false + gap + margin 夹紧） ─
const mkPlace = (name: string, placement: string, center?: boolean): Component => {
  const P = (_init: Record<string, never>, ctx: any) => {
    let triggerEl: HTMLElement | null = null
    const popup = ctx.ui.usePopup({ el: () => triggerEl, placement: placement as never, center, gap: 12, margin: 20 })
    return () =>
      h('div', { class: `place-${name}`, style: { marginTop: '60px' } },
        h('button', {
          class: `place-btn-${name}`,
          ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
          onClick: () => { popup.setOpen(!popup.open); ctx.render() },
        }, name),
        popup.portal(h('div', { class: `place-panel-${name}` }, `面板-${name}`), `place-${name}`),
      )
  }
  return P
}
const PlaceBottom = mkPlace('bottom', 'bottom')
const PlaceTop = mkPlace('top', 'top')
const PlaceLeft = mkPlace('left', 'left')
const PlaceRight = mkPlace('right', 'right')
const PlaceLeftAlign = mkPlace('leftalign', 'bottom', false)
const PlacementScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'placement-scene', style: { paddingTop: '220px', paddingLeft: '220px' } },
      h(PlaceBottom, {}),
      h(PlaceTop, {}),
      h(PlaceLeft, {}),
      h(PlaceRight, {}),
      h(PlaceLeftAlign, {}),
    )

// ── 场景 27：closeOnOutside/closeOnEscape 开关（默认 true——显式 false 禁用） ─
const CloseSwitchScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  const popup = ctx.ui.usePopup({ el: () => triggerEl, placement: 'bottom', closeOnOutside: false, closeOnEscape: false })
  return () =>
    h('div', { class: 'close-switch-scene' },
      h('button', {
        class: 'cs-trigger', ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '开关'),
      popup.portal(h('div', { class: 'cs-panel' }, '面板'), 'close-switch'),
    )
}

// ── 场景 28：hover 触发（trigger hover + openDelay/closeDelay + disabled） ─
const HoverTriggerScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  let disabled = false
  const popup = ctx.ui.usePopup({
    el: () => triggerEl, trigger: 'hover', placement: 'bottom',
    openDelay: 200, closeDelay: 300, disabled: () => disabled,
  })
  return () =>
    h('div', { class: 'hover-trigger-scene' },
      h('button', {
        class: 'ht-trigger',
        ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        ...popup.wrapProps, // hover 自动触发（mouseenter/leave + 延迟 + disabled）
      }, '悬停'),
      h('button', { class: 'ht-disable', onClick: () => { disabled = true; ctx.render() } }, '禁用'),
      popup.portal(h('div', { class: 'ht-panel' }, '悬停面板'), 'hover-trigger'),
    )
}

// ── 场景 29：受控 getter + positioning none（自定义定位——无 top/left） ─
const ControlledNoneScene = (_init: Record<string, never>, ctx: any) => {
  let open2 = false
  let triggerEl: HTMLElement | null = null
  const popup = ctx.ui.usePopup({
    el: () => triggerEl, isOpen: () => open2, setOpen: (v: boolean) => { open2 = v; ctx.render() },
    positioning: 'none',
  })
  return () =>
    h('div', { class: 'controlled-none-scene' },
      h('button', {
        class: 'cn-trigger', ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '开关'),
      popup.portal(h('div', { class: 'cn-panel', style: { inset: '0 auto auto 0' } }, '自定义面板'), 'controlled-none'),
    )
}

// ── 场景 30：presence 退场状态机（exit 阶段仍渲染——无动画立即 closed） ─
const PresenceScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  const popup = ctx.ui.usePopup({ el: () => triggerEl, placement: 'bottom', presence: true })
  return () =>
    h('div', { class: 'presence-scene' },
      h('button', {
        class: 'ps-trigger', ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '开关'),
      popup.portal(h('div', { class: 'ps-panel' }, '退场面板'), 'presence'),
    )
}

// ── 场景 31：mask/maskCentered/maskClosable（遮罩渲染 + 点击关闭） ──────
const MaskScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  const popup = ctx.ui.usePopup({ el: () => triggerEl, mask: true, maskCentered: true, maskClosable: true, positioning: 'none' })
  return () =>
    h('div', { class: 'mask-scene' },
      h('button', {
        class: 'mk-trigger', ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '打开'),
      popup.portal(h('div', { class: 'mk-content' }, '居中内容'), 'mask'),
    )
}

// ── 场景 32：trapFocus + lockScroll（焦点陷阱 + 滚动锁） ────────────────
const TrapScene = (_init: Record<string, never>, ctx: any) => {
  let triggerEl: HTMLElement | null = null
  const popup = ctx.ui.usePopup({ el: () => triggerEl, placement: 'bottom', trapFocus: true, lockScroll: true })
  return () =>
    h('div', { class: 'trap-scene' },
      h('button', {
        class: 'tr-trigger', ref: (el: unknown) => { if (el) triggerEl = el as HTMLElement },
        onClick: () => { popup.setOpen(!popup.open); ctx.render() },
      }, '开关'),
      popup.portal(h('div', { class: 'tr-panel' },
        h('button', { class: 'tr-focus-1' }, '第一'),
        h('button', { class: 'tr-focus-2' }, '第二'),
      ), 'trap'),
    )
}

// ── 场景 33：toast（命令式轻提示——显示 + 自动消失） ───────────────────
const ToastScene = (_init: Record<string, never>, ctx: any) =>
  () =>
    h('div', { class: 'toast-scene' },
      h('button', { class: 'toast-fire', onClick: () => ctx.toast('操作成功', 'success', 500) }, '弹提示'),
    )

// ── 场景 34：useControlled（受控/非受控/受控缺回调 warn） ──────────────
const ControlledScene = (_init: Record<string, never>, ctx: any) => {
  let lastChange: string | null = null
  // 受控：value 显式（父控制——setValue 只走 onChange 不回流）
  const ctrl = ctx.ui.useControlled<string>({ value: '父值', onChange: (v: string) => { lastChange = v; ctx.render() } })
  const unctrl = ctx.ui.useControlled<string>({}, '非受控默认')
  return () =>
    h('div', { class: 'controlled-scene' },
      h('span', { class: 'ctrl-val' }, ctrl.value ?? '无'),
      h('button', { class: 'ctrl-set', onClick: () => ctrl.setValue('新值') }, '设置受控'),
      h('span', { class: 'unctrl-val' }, unctrl.value ?? '无'),
      h('button', { class: 'unctrl-set', onClick: () => unctrl.setValue('内部') }, '设置非受控'),
      h('span', { class: 'ctrl-change' }, lastChange ?? '无回调'),
    )
}

// ── 场景 35：useBreakpoint（命名断点——min-width 语义） ────────────────
const BreakpointScene = (_init: Record<string, never>, ctx: any) =>
  () => {
    const bp = ctx.ui.useBreakpoint({ mobile: 0, tablet: 768, desktop: 1024 })
    return h('div', { class: 'bp-scene' }, h('span', { class: 'bp-name' }, bp))
  }

// ── 场景 36：useTween（数值补间——rAF 驱动到目标） ─────────────────────
const TweenScene = (_init: Record<string, never>, ctx: any) => {
  // 契约：useTween 的 target 是 mount 快照——目标变化经 tween.reset(to) 显式驱动
  const tween = ctx.ui.useTween(0, { duration: 200 })
  return () =>
    h('div', { class: 'tween-scene' },
      h('span', { class: 'tween-val' }, tween.value.toFixed(0)),
      h('button', { class: 'tween-go', onClick: () => tween.reset(100) }, '到 100'),
    )
}

// ── 场景 37：confirm/notification 命令式（BUG#3 回归面——中间件注入） ─
const ConfirmScene = (_init: Record<string, never>, ctx: any) => {
  let result: string | null = null
  return () =>
    h('div', { class: 'confirm-scene' },
      h('button', { class: 'cf-confirm', onClick: () => { void ctx.confirm('确定删除？').then((r: boolean) => { result = String(r); ctx.render() }) } }, '确认'),
      h('button', { class: 'cf-notify', onClick: () => ctx.notification('保存成功', { type: 'success', duration: 500 }) }, '通知'),
      h('span', { class: 'cf-result' }, result ?? '无'),
    )
}

// ── 场景 38：useDrag（指针拖拽——move/up 回调） ────────────────────────
const DragHookScene = (_init: Record<string, never>, ctx: any) => {
  let moved = 0
  let ended = 0
  const drag = ctx.ui.useDrag({
    onMove: () => { moved += 1 },
    onEnd: () => { ended += 1; ctx.render() },
  })
  return () =>
    h('div', { class: 'drag-hook-scene', ...drag, style: { width: '100px', height: '100px', background: '#eee' } },
      h('span', { class: 'dh-moved' }, `m:${moved}`),
      h('span', { class: 'dh-ended' }, `e:${ended}`),
    )
}

// ── 场景 39：useVisualViewport（视口尺寸/偏移跟随） ────────────────────
const ViewportScene = (_init: Record<string, never>, ctx: any) => {
  const vv = ctx.ui.useVisualViewport()
  return () =>
    h('div', { class: 'viewport-scene' },
      h('span', { class: 'vv-height' }, String(Math.round(vv.height))),
      h('span', { class: 'vv-offset' }, String(Math.round(vv.offsetTop))),
    )
}


// ── 深度场景组 1：表单输入 + 开关切换（参数行为断言） ─────────────────
const DeepInput = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-input-scene' },
      h(CInput, { placeholder: '输入', onInput: (e: Event) => { log += `v:${(e.target as HTMLInputElement).value};`; ctx.render() } }),
      h(CInput, { placeholder: '禁用', disabled: true }),
      h('span', { class: 'deep-input-log' }, log),
    )
}

const DeepInputNumber = (_i: Record<string, never>, ctx: any) => {
  // 受控契约：value 必填 + onChange 回流（纯受控组件——无内部状态）
  let val: number | null = 4
  let log = ''
  return () =>
    h('div', { class: 'deep-inputnumber-scene' },
      h(CInputNumber, { value: val, min: 0, max: 10, step: 2, onChange: (v: number | null) => { val = v; log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-inputnumber-log' }, log),
    )
}

const DeepTextarea = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-textarea-scene' },
      h(CTextarea, { placeholder: '多行', onInput: (e: Event) => { log += `v:${(e.target as HTMLTextAreaElement).value};`; ctx.render() } }),
      h('span', { class: 'deep-textarea-log' }, log),
    )
}

const DeepSearch = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-search-scene' },
      h(CSearchInput, { placeholder: '搜索', onInput: (e: Event) => { log += `i:${(e.target as HTMLInputElement).value};`; ctx.render() } }),
      h('span', { class: 'deep-search-log' }, log),
    )
}

const DeepPassword = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-password-scene' },
      h(CPasswordInput, { placeholder: '密码', onInput: (e: Event) => { log += `v:${(e.target as HTMLInputElement).value};`; ctx.render() } }),
      h('span', { class: 'deep-password-log' }, log),
    )
}

const DeepPin = (_i: Record<string, never>, ctx: any) => {
  // 受控回流（纯受控显示——value 必须回流否则不累积）
  let val = ''
  let log = ''
  return () =>
    h('div', { class: 'deep-pin-scene' },
      h(CPinInput, { length: 4, type: 'number', value: val, onChange: (v: string) => { val = v; log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-pin-log' }, log),
    )
}

const DeepSwitch = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-switch-scene' },
      h(CSwitch, { checked: false, onChange: (c: boolean) => { log += `c:${c};`; ctx.render() } }),
      h(CSwitch, { checked: true, disabled: true }),
      h('span', { class: 'deep-switch-log' }, log),
    )
}

const DeepCheckbox = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-checkbox-scene' },
      h(CCheckbox, { checked: false, onChange: (c: boolean) => { log += `c:${c};`; ctx.render() } }, '勾选'),
      h('span', { class: 'deep-checkbox-log' }, log),
    )
}

const DeepRadio = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-radio-scene' },
      h(CRadioGroup, { options: [{ value: '甲', label: '甲' }, { value: '乙', label: '乙' }, { value: '丙', label: '丙' }], value: '甲', onChange: (v: string) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-radio-log' }, log),
    )
}

const DeepSlider = (_i: Record<string, never>, ctx: any) => {
  // 受控回流（value 默认 0——受控组件）
  let val = 50
  let log = ''
  return () =>
    h('div', { class: 'deep-slider-scene' },
      h(CSlider, { value: val, min: 0, max: 100, step: 5, onChange: (v: number) => { val = v; log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-slider-log' }, log),
    )
}

const DeepRate = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-rate-scene' },
      h(CRate, { count: 5, defaultValue: 3, onChange: (v: number) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-rate-log' }, log),
    )
}

const DeepTags = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-tags-scene' },
      h(CTagsInput, { maxTags: 3, onChange: (t: string[]) => { log += `t:${t.join(',')};`; ctx.render() } }),
      h('span', { class: 'deep-tags-log' }, log),
    )
}

const DeepSegmented = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-segmented-scene' },
      h(CSegmentedControl, { options: [{ value: '日', label: '日' }, { value: '周', label: '周' }, { value: '月', label: '月' }], onChange: (v: string) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-segmented-log' }, log),
    )
}

const DeepToggle = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-toggle-scene' },
      h(CToggleGroup, { type: 'multiple', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], onChange: (v: string | string[]) => { log += `v:${String(v)};`; ctx.render() } }),
      h('span', { class: 'deep-toggle-log' }, log),
    )
}


// ── 深度场景组 2：选择组件（参数行为断言） ─────────────────────────────
const DeepSelect = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-select-scene' },
      h(CSelect, { options: [{ value: 'a', label: '苹果' }, { value: 'b', label: '香蕉' }, { value: 'c', label: '橙子' }], placeholder: '选水果', onChange: (v: string | string[]) => { log += `v:${String(v)};`; ctx.render() } }),
      h('span', { class: 'deep-select-log' }, log),
    )
}

const DeepAutoComplete = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-autocomplete-scene' },
      h(CAutoComplete, { options: [{ value: '支付平台管理' }, { value: '支付平账系统' }, { value: '用户中心' }], value: '', placeholder: '搜索', onChange: (v: string) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-autocomplete-log' }, log),
    )
}

const DeepCascader = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-cascader-scene' },
      h(CCascader, { options: [{ value: 'zhejiang', label: '浙江', children: [{ value: 'hangzhou', label: '杭州' }, { value: 'ningbo', label: '宁波' }] }, { value: 'jiangsu', label: '江苏', children: [{ value: 'nanjing', label: '南京' }] }], placeholder: '省市区', onChange: (v: unknown) => { log += `v:${String(v)};`; ctx.render() } }),
      h('span', { class: 'deep-cascader-log' }, log),
    )
}

const DeepTreeSelect = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-treeselect-scene' },
      h(CTreeSelect, { options: [{ key: '1', label: '节点1', children: [{ key: '1-1', label: '子节点1-1' }] }, { key: '2', label: '节点2' }], placeholder: '选树', onChange: (v: unknown) => { log += `v:${String(v)};`; ctx.render() } }),
      h('span', { class: 'deep-treeselect-log' }, log),
    )
}

const DeepTransfer = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-transfer-scene' },
      h(CTransfer, { data: [{ key: '1', label: '项1' }, { key: '2', label: '项2' }, { key: '3', label: '项3' }], onChange: (k: string[]) => { log += `v:${k.join(',')};`; ctx.render() } }),
      h('span', { class: 'deep-transfer-log' }, log),
    )
}

const DeepColorPicker = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-colorpicker-scene' },
      h(CColorPicker, { value: '#1677ff', onChange: (c: string) => { log += `v:${c};`; ctx.render() } }),
      h('span', { class: 'deep-colorpicker-log' }, log),
    )
}

const DeepDatePicker = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-datepicker-scene' },
      h(CDatePicker, { value: '2026-01-15', onChange: (v: string) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-datepicker-log' }, log),
    )
}

const DeepCalendar = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-calendar-scene' },
      h(CCalendar, { selectedDate: '2026-01-15', onSelectDate: (v: string) => { log += `v:${v};`; ctx.render() } }),
      h('span', { class: 'deep-calendar-log' }, log),
    )
}


// ── 深度场景组 3：导航 + 数据展示（参数行为断言） ─────────────────────
const DeepTabs = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-tabs-scene' },
      h(CTabs, { items: [{ key: 'a', label: '标签A' }, { key: 'b', label: '标签B' }], onChange: (k: string) => { log += `v:${k};`; ctx.render() } }),
      h('span', { class: 'deep-tabs-log' }, log),
    )
}

const DeepMenu = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-menu-scene' },
      h(CMenu, { items: [{ key: '1', label: '菜单一' }, { key: '2', label: '菜单二' }], onSelect: (k: string) => { log += `v:${k};`; ctx.render() } }),
      h('span', { class: 'deep-menu-log' }, log),
    )
}

const DeepPagination = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-pagination-scene' },
      h(CPagination, { total: 50, pageSize: 10, current: 1, onChange: (p: number) => { log += `v:${p};`; ctx.render() } }),
      h('span', { class: 'deep-pagination-log' }, log),
    )
}

const DeepTable = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-table-scene' },
      h(CTable, { columns: [{ key: 'name', title: '名称', sortable: true }, { key: 'age', title: '年龄' }], data: [{ name: '甲', age: 20 }, { name: '乙', age: 30 }], onSort: (k: string, order: string) => { log += `v:${k}:${order};`; ctx.render() } }),
      h('span', { class: 'deep-table-log' }, log),
    )
}

const DeepCollapse = (_i: Record<string, never>, ctx: any) => {
  // 受控（active + onChange 回流——非受控不调 onChange）
  let active: string[] = []
  let log = ''
  return () =>
    h('div', { class: 'deep-collapse-scene' },
      h(CCollapse, { items: [{ key: '1', title: '面板一', content: '内容一' }], active, onChange: (k: string[]) => { active = k; log += `v:${k.join(',')};`; ctx.render() } }),
      h('span', { class: 'deep-collapse-log' }, log),
    )
}

const DeepAccordion = (_i: Record<string, never>, ctx: any) => {
  // 受控（同 Collapse——非受控不调 onChange）
  let active: string[] = []
  let log = ''
  return () =>
    h('div', { class: 'deep-accordion-scene' },
      h(CAccordion, { items: [{ key: '1', title: '折叠一', content: '内容一' }], active, onChange: (k: string[]) => { active = k; log += `v:${k.join(',')};`; ctx.render() } }),
      h('span', { class: 'deep-accordion-log' }, log),
    )
}

const DeepCarousel = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-carousel-scene' },
      h(CCarousel, { showArrows: true }, h('div', { class: 'carousel-slide-0' }, '图一'), h('div', { class: 'carousel-slide-1' }, '图二')),
      h('span', { class: 'deep-carousel-log' }, log),
    )
}

const DeepSteps = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-steps-scene' },
      h(CSteps, { items: [{ title: '一步' }, { title: '二步' }], current: 0 }),
      h('span', { class: 'deep-steps-state' }, 'ok'),
    )
}

const DeepList = (_i: Record<string, never>, ctx: any) => {
  let log = ''
  return () =>
    h('div', { class: 'deep-list-scene' },
      h(CList, { items: ['项A', '项B'], renderItem: (i: string) => h('div', {}, i) }),
      h('span', { class: 'deep-list-log' }, log),
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
  { id: 'popup-placement', title: 'usePopup placement 矩阵（四方向/center/gap/margin）', render: PlacementScene },
  { id: 'popup-close-switch', title: 'usePopup closeOnOutside/Escape 开关', render: CloseSwitchScene },
  { id: 'popup-hover', title: 'usePopup hover 触发（延迟 + disabled）', render: HoverTriggerScene },
  { id: 'popup-controlled-none', title: 'usePopup 受控 getter + positioning none', render: ControlledNoneScene },
  { id: 'popup-presence', title: 'usePopup presence（退场状态机）', render: PresenceScene },
  { id: 'popup-mask', title: 'usePopup mask（遮罩渲染 + 点击关闭）', render: MaskScene },
  { id: 'popup-trap', title: 'usePopup trapFocus + lockScroll（焦点陷阱 + 滚动锁）', render: TrapScene },
  { id: 'toast-fire', title: 'toast（命令式轻提示——显示 + 自动消失）', render: ToastScene },
  { id: 'use-controlled', title: 'useControlled（受控/非受控/warn）', render: ControlledScene },
  { id: 'use-breakpoint', title: 'useBreakpoint（命名断点切换）', render: BreakpointScene },
  { id: 'use-tween', title: 'useTween（数值补间到目标）', render: TweenScene },
  { id: 'confirm-command', title: 'confirm/notification 命令式（BUG#3 回归）', render: ConfirmScene },
  { id: 'use-drag', title: 'useDrag（指针拖拽——move/up 回调）', render: DragHookScene },
  { id: 'use-visual-viewport', title: 'useVisualViewport（视口尺寸跟随）', render: ViewportScene },
  { id: 'component-smoke', title: '组件冒烟（40 核心组件陈列——渲染+点击扫描）', render: SmokeScene },
  { id: 'deep-input', title: 'Input 参数（onChange/disabled）', render: DeepInput },
  { id: 'deep-inputnumber', title: 'InputNumber 参数（min/max/step/onChange）', render: DeepInputNumber },
  { id: 'deep-textarea', title: 'Textarea 参数（onChange）', render: DeepTextarea },
  { id: 'deep-search', title: 'SearchInput 参数（onInput）', render: DeepSearch },
  { id: 'deep-password', title: 'PasswordInput 参数（掩码输入）', render: DeepPassword },
  { id: 'deep-pin', title: 'PinInput 参数（length/逐格→完整值）', render: DeepPin },
  { id: 'deep-switch', title: 'Switch 参数（checked/onChange/disabled）', render: DeepSwitch },
  { id: 'deep-checkbox', title: 'Checkbox 参数（checked/onChange）', render: DeepCheckbox },
  { id: 'deep-radio', title: 'RadioGroup 参数（value/onChange）', render: DeepRadio },
  { id: 'deep-slider', title: 'Slider 参数（min/max/step/onChange）', render: DeepSlider },
  { id: 'deep-rate', title: 'Rate 参数（count/onChange）', render: DeepRate },
  { id: 'deep-tags', title: 'TagsInput 参数（maxTags/onChange）', render: DeepTags },
  { id: 'deep-segmented', title: 'SegmentedControl 参数（options/onChange）', render: DeepSegmented },
  { id: 'deep-toggle', title: 'ToggleGroup 参数（type/onChange）', render: DeepToggle },
  { id: 'deep-select', title: 'Select 参数（options/onChange）', render: DeepSelect },
  { id: 'deep-autocomplete', title: 'AutoComplete 参数（options/onChange）', render: DeepAutoComplete },
  { id: 'deep-cascader', title: 'Cascader 参数（级联选择）', render: DeepCascader },
  { id: 'deep-treeselect', title: 'TreeSelect 参数（树选择）', render: DeepTreeSelect },
  { id: 'deep-transfer', title: 'Transfer 参数（穿梭）', render: DeepTransfer },
  { id: 'deep-colorpicker', title: 'ColorPicker 参数（选色）', render: DeepColorPicker },
  { id: 'deep-datepicker', title: 'DatePicker 参数（选日期）', render: DeepDatePicker },
  { id: 'deep-calendar', title: 'Calendar 参数（切换/选日）', render: DeepCalendar },
  { id: 'deep-tabs', title: 'Tabs 参数（切换）', render: DeepTabs },
  { id: 'deep-menu', title: 'Menu 参数（选择）', render: DeepMenu },
  { id: 'deep-pagination', title: 'Pagination 参数（翻页）', render: DeepPagination },
  { id: 'deep-table', title: 'Table 参数（排序）', render: DeepTable },
  { id: 'deep-collapse', title: 'Collapse 参数（展开折叠）', render: DeepCollapse },
  { id: 'deep-accordion', title: 'Accordion 参数（展开折叠）', render: DeepAccordion },
  { id: 'deep-carousel', title: 'Carousel 参数（切换）', render: DeepCarousel },
  { id: 'deep-steps', title: 'Steps 参数（渲染）', render: DeepSteps },
  { id: 'deep-list', title: 'List 参数（onItemClick）', render: DeepList },
]

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
