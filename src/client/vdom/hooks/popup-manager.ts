/**
 * vdom 命令式弹窗内核（2027-03——一个形态：ctx.popup.open——toast 心智）
 *
 * 设计（design/imperative-popup-plan.md）：
 * - **唯一形态**：openPopup(opts) → PopupHandle——调用点构建内容——内核
 *   自管理挂载/更新/卸载/销毁（挂载/卸载/销毁在实例内——无框架机制依赖）
 * - **每次 openPopup = 独立实例**（普通闭包状态——非 hook 状态——无共享
 *   冲突——NavMenu applierSame 类问题根治）
 * - **渲染串行链 + 版本守卫**：链保证串行（防并发 diff）；版本号丢弃过时
 *   渲染（update 比渲染快时旧渲染跳过——无 applier 引用比较误判）
 * - **零 Portal vnode**：内容直接 renderToStream 到独立 applier——主树
 *   完全不知道浮层存在（与 ctx.toast 同构）
 *
 * 能力（组件层消费）：
 * - **定位**：anchor 锚定 + placement/center/gap/margin + 视口夹紧 +
 *   0-rect 防护 + 面板未布局 rAF 重试（复用 computePos）
 * - **交互**：外部点击关闭（el/panel 外）+ Escape 关闭（per-instance
 *   监听——close 时移除——无常驻）
 * - **会话级模态**：presence（退场动画 open→exit→closed→dispose）+
 *   trapFocus（Tab 焦点陷阱）+ lockScroll（滚动锁 + 焦点归还）
 * - **mask**：遮罩 + 居中（maskClosable——危险操作防误触）
 */

import type { VNode, VNodeChild } from '../core/vnode.ts'
import { h } from '../core/vnode.ts'
import type { Command } from '../core/command/index.ts'
import { renderV2 } from '../core/v2/render.ts'
import { diffV2, disposeSegment, type SegmentMap } from '../core/v2/diff.ts'
import { CommandApplier } from '../core/patch/index.ts'
import { createComponentRegistry } from '../core/node/component.ts'
import { PORTAL_CONTAINER_ID, portalContainerId } from '../core/node/portal.ts'
import type { HookEnv } from './env.ts'
import { computePos, hasAnim, type PopupPlacement } from './popup.ts'
import { Subject, scan, type Observable } from '../observable/index.ts'

export type PopupPhase = 'closed' | 'open' | 'exit'

/** 弹窗迁移事件（**流化（2027-09）——时间线可回放**） */
export type PopupEvent =
  | { kind: 'open' }
  | { kind: 'exit' }    // presence 退场（close 于 open 态）
  | { kind: 'closed' }  // finalizeClose（dispose 前）
  | { kind: 'disposed' }

/** 弹窗相位迁移表（**纯 reducer——波次 6**）：open →（close）→ exit/closed；
 *  disposed = 幂等 closed（unmount 终态——重复 finalize 零迁移） */
export function popupPhaseReducer(s: PopupPhase, e: PopupEvent): PopupPhase {
  switch (e.kind) {
    case 'open': return 'open'
    case 'exit': return s === 'open' ? 'exit' : s
    case 'closed': return 'closed'
    case 'disposed': return 'closed'
  }
}

export interface PopupOpenOptions {
  /** 内容（VNode 或工厂——打开/更新时构建——关闭态不构建） */
  content: VNodeChild | (() => VNodeChild)
  /** 锚点元素（锚定浮层——getter 渲染期读最新） */
  anchor?: HTMLElement | (() => HTMLElement | null)
  placement?: PopupPlacement | (() => PopupPlacement)
  /** 左对齐（默认居中于锚点——水平+垂直） */
  center?: boolean
  /** 锚点与面板间距 */
  gap?: number
  /** 视口边距（夹紧） */
  margin?: number
  /** 定位模式（none = 组件自定义定位——.wf-modal inset:0 居中） */
  positioning?: 'anchor' | 'none'
  /** 自定义坐标（光标处等——覆盖 computePos——width 面板宽度跟随 trigger——
   *  同 usePopup position 语义） */
  position?: () => { x: number; y: number; width?: number }
  /** 遮罩 + 居中（Img preview 等轻量居中弹层） */
  mask?: boolean
  maskCentered?: boolean
  /** 遮罩点击关闭（默认 true——危险操作显式 false 防误触） */
  maskClosable?: boolean
  /** 会话级模态：退场动画（open→exit→closed→dispose） */
  presence?: boolean
  /** 焦点陷阱（Tab 面板内循环） */
  trapFocus?: boolean
  /** 滚动锁（body overflow hidden + 关闭归还焦点） */
  lockScroll?: boolean
  /** 外部点击关闭（默认 true——Confirm 等危险操作显式 false） */
  closeOnOutside?: boolean
  /** Escape 关闭（默认 true） */
  closeOnEscape?: boolean
  /** 容器 key（同组件多个弹层区分——默认 'popup'） */
  key?: string
  /** 关闭回调（内核 dispose 后——组件同步句柄状态） */
  onClose?: () => void
}

export interface PopupHandle {
  /** 关闭（presence：exit 动画 → animationend → dispose） */
  close(): void
  /** 内容更新（props 变化——diff 增量——自定义坐标同步读 position getter） */
  update(content: VNodeChild): void
  /** 坐标/内容重渲染（组件状态变化后——Slider tooltip 跟随等） */
  refresh(): void
  /** open getter */
  get open(): boolean
  /** **迁移事件流（波次 6——open/exit/closed/disposed——时间线可回放）** */
  events$: Observable<PopupEvent>
}

interface PopupState {
  tree: VNode | null
  applier: CommandApplier | null
  container: HTMLElement | null
  chain: Promise<void>
  version: number
  open: boolean
  phase: PopupPhase
  disposed: boolean
  panel: HTMLElement | null
  pos: { top: number; left: number; width?: number }
  /** v2 段表（弹窗级独立实例——v2 引擎渲染） */
  segments: SegmentMap
}

/** 内容解析（工厂延迟构建） */
function resolveContent(content: VNodeChild | (() => VNodeChild)): VNodeChild {
  return typeof content === 'function' ? (content as () => VNodeChild)() : content
}

/** 锚点解析（getter 渲染期读最新） */
function resolveAnchor(a: HTMLElement | (() => HTMLElement | null) | undefined): HTMLElement | null {
  if (!a) return null
  return typeof a === 'function' ? a() : a
}

/**
 * openPopup——命令式弹窗内核（唯一形态——toast 心智）
 *
 * 组件内部样板（受控同步）：
 * ```ts
 * let handle: PopupHandle | null = null
 * const syncPopup = (props) => {
 *   if (props.open && !handle)
 *     handle = ctx.ui.openPopup({ anchor: () => anchorEl, content: () => panelVn(props), onClose: () => { handle = null; ctx.ui.render() } })
 *   else if (!props.open && handle) { handle.close(); handle = null }
 *   else if (handle) handle.update(panelVn(props))
 * }
 * ```
 */
export function openPopup(env: HookEnv, opts: PopupOpenOptions): PopupHandle {
  const state: PopupState = {
    tree: null, applier: null, container: null, chain: Promise.resolve(),
    version: 0, open: false, phase: 'closed', disposed: false, panel: null,
    pos: { top: 0, left: 0 }, segments: new Map() as SegmentMap,
  }
  // **相位单源（波次 6——events$ = scan 折叠——手写 phase 迁移删除）**
  const events = new Subject<PopupEvent>()
  const events$ = events.asObservable()
  events.asObservable().pipe(scan(popupPhaseReducer, 'closed')).subscribe({ next: (p) => { state.phase = p } })
  const emitEvent = (e: PopupEvent): void => { events.next(e) }
  const win = env.getBrowser()?.window
  const doc = env.getBrowser()?.document

  /** 容器（#__wf_portal + per-key 子容器） */
  const ensureContainer = (): HTMLElement | null => {
    if (!doc) return null // SSR 裁剪（打开态浮层内容不渲染）
    if (state.container) return state.container
    let root = doc.getElementById(PORTAL_CONTAINER_ID)
    if (!root) {
      root = doc.createElement('div')
      root.id = PORTAL_CONTAINER_ID
      doc.body.appendChild(root)
    }
    const key = opts.key ?? 'popup'
    const existing = doc.getElementById(portalContainerId(key))
    if (existing) state.container = existing as HTMLElement
    else {
      state.container = doc.createElement('div')
      state.container.id = portalContainerId(key)
      root.appendChild(state.container)
    }
    return state.container
  }

  /** 定位（锚点 rect + 面板尺寸——0-rect 防护——面板未布局 rAF 重试） */
  let retries = 0
  let positioned = false // 首定位完成（panelRefImpl 不再自动触发——
  // 定位 render → 面板重建 → panelRef 循环——2027-09 DatePicker 无限循环实证）
  const refresh = (): void => {
    if (state.disposed || !state.open) return
    // **position 优先（2027-09——ContextMenu 左上角实证）**：光标弹窗
    // （ContextMenu/长按类）无 anchor——旧序先 resolveAnchor(el null)
    // → 永不进 position 分支 → 重试耗尽 → state.pos 恒 {0,0}——左上角——
    // 自定义坐标定位不需要 anchor——置于最前（panel 未就绪仍重试）
    if (opts.position && state.panel) {
      const pv = opts.position()
      if (pv && typeof pv.x === 'number' && typeof pv.y === 'number') {
        state.pos = { top: pv.y, left: pv.x, width: pv.width }
        positioned = true
        // **坐标落地（直接 DOM——零渲染零嵌套——**state.tree 二次包装
        // 嵌套 mask 层——DatePicker 实证**）
        applyPosToPanel()
        return
      }
    }
    const el = resolveAnchor(opts.anchor)
    if (!el || !state.panel) {
      if (retries++ < 10) queueMicrotask(refresh)
      return
    }
    if (!win) return
    const panelEl = state.panel
    const pw = panelEl.offsetWidth || panelEl.getBoundingClientRect().width
    const ph = panelEl.offsetHeight || panelEl.getBoundingClientRect().height
    if ((pw === 0 || ph === 0) && retries++ < 10) {
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(refresh)
      else queueMicrotask(refresh)
      return
    }
    const placement = typeof opts.placement === 'function' ? opts.placement() : (opts.placement ?? 'bottom')
    const p = computePos(el, win, pw, ph, placement, opts.gap ?? 8, opts.margin ?? 8, opts.center ?? true)
    if (!p) {
      if (retries++ < 10) queueMicrotask(refresh)
      return
    }
    retries = 0
    state.pos = p
    // 坐标落地（面板 style 更新——重渲染内容——轻量 diff）
    if (state.applier) {
      const panelVn = buildPanelVn(state.tree)
      if (panelVn) render(panelVn)
    }
  }

  /** 面板根元素 ref（定位/退场动画监听） */
  const panelRefImpl = (el: HTMLElement | null): void => {
    state.panel = el
    // **首定位守卫（2027-09——position 定位 render 循环实证）**：定位
    // render → 面板重建 → panelRef 重触发 → 再定位……无限循环——
    // positioned（定位成功）后不再自动触发（scroll/resize 动态跟踪由
    // 组件主动 handle.refresh 负责——定位后坐标静态即可）
    if (el && state.open && !positioned && opts.positioning !== 'none') {
      if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(refresh)
      else queueMicrotask(refresh)
    }
    // presence：退场动画结束 → closed → dispose
    if (el && opts.presence) {
      const onAnimEnd = (e: AnimationEvent): void => {
        if (state.phase === 'exit') finalizeClose()
      }
      el.addEventListener('animationend', onAnimEnd)
      env.onUnmount(() => el.removeEventListener('animationend', onAnimEnd))
    }
  }

  // **position 定位层 ref（2027-09——mask+position 职责分离实证）**：
  // state.panel = mask（全屏遮罩）——定位坐标落在 mask-inner（日历层）——
  // 坐标落地直接改 posEl 的 style（零渲染——refresh 若 render 会二次包装
  // 嵌套层——DatePicker 双层 mask 实证）
  let posEl: HTMLElement | null = null
  const posRefImpl = (el: HTMLElement | null): void => {
    posEl = el
    // **挂载后补落地（2027-09——mask+position 无 update 场景实证）**：
    // refresh 首定位时 inner 可能未挂载（创建顺序 mask→inner→content——
    // applyPosToPanel 时 posEl null——style 永不落地——posEl 就绪后补一次）
    if (el && positioned) applyPosToPanel()
  }
  /** 坐标落地（posEl/面板 DOM 直接更新——零渲染零嵌套） */
  const applyPosToPanel = (): void => {
    const t = opts.mask ? posEl : state.panel
    if (!t) return
    t.style.top = `${state.pos.top}px`
    t.style.left = `${state.pos.left}px`
    if (state.pos.width !== undefined) t.style.width = `${state.pos.width}px`
  }

  /** 内容包装（mask/class/style/ref 注入——同 popup.portal 语义） */
  const buildPanelVn = (content: VNode | null): VNode | null => {
    if (!content) return null
    let panelVn = content
    // **mask + 自定义坐标分离（2027-09——DatePicker 视口中心实证）**：
    // mask（遮罩）必须全屏（inset:0）——position 注入到 mask 会把遮罩
    // 压缩成非全屏（inset 序列化被 top/left 覆盖）——且日历仍 flex
    // center in mask——看似视口中心——定位失效——**position 弹窗的定位
    //  注入 mask-inner（日历层）——遮罩保持全屏——两层的职责分离**
    if (opts.mask) {
      const maskEl = h('div', {
        class: 'wf-popup-mask',
        style: {
          position: 'fixed', inset: '0', background: 'var(--wf-overlay, rgba(0,0,0,0.5))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 'var(--wf-z-modal, 1000)',
        },
        onClick: (e: Event) => {
          if (opts.maskClosable !== false && e.target === e.currentTarget) close()
        },
      }, opts.maskCentered
        ? { ...panelVn, props: { ...(panelVn.props ?? {}) } }
        : h('div', {
          class: 'wf-popup-mask-inner',
          ref: posRefImpl,
          style: opts.position
            ? {
              position: 'fixed', top: `${state.pos.top}px`, left: `${state.pos.left}px`,
              ...(state.pos.width !== undefined ? { width: `${state.pos.width}px` } : {}),
            }
            : undefined,
        }, panelVn))
      panelVn = maskEl
    }
    const props = (panelVn.props ?? {}) as Record<string, any>
    const cls = opts.positioning === 'none' || String(props.class ?? '').includes('mask')
      ? (props.class ?? '')
      : ['wf-popup', props.class].filter(Boolean).join(' ')
    // **注入面切换（position 已有 mask-inner 承载——面板层零注入**：
    // mask+position 组合不重复注入（top/left 双写——mask 被压缩——
    // DatePicker 实证）；其余（anchor 定位/无 mask）维持注入——
    // **injectPos 判定：仅 mask+position 组合由 mask-inner 承载**（
    // 2027-09 回归——anchor 弹窗 top/left 断言）
    const injectPos = !(opts.mask && opts.position)
    const style = opts.positioning === 'none'
      ? { ...(props.style ?? {}), position: 'fixed' }
      : {
          ...(props.style ?? {}),
          position: 'fixed',
          ...(injectPos ? { top: `${state.pos.top}px`, left: `${state.pos.left}px` } : {}),
          ...(injectPos && state.pos.width !== undefined ? { width: `${state.pos.width}px` } : {}),
        }
    return { ...panelVn, props: { ...props, class: cls, style, ref: panelRefImpl } } as VNode
  }

  /** 渲染（串行链 + 版本守卫——过时渲染跳过） */
  const render = (content: VNode): void => {
    const v = ++state.version
    const prev = state.tree
    state.tree = content
    state.chain = state.chain.then(async () => {
      if (state.disposed || v !== state.version) return
      const applier = state.applier
      if (!applier) return
      const registry = applier.registry
      if (!registry) return
      const ctx = env.getSharedContext() ?? ({} as import('../context/UIContext.ts').UIContext)
      // **v2 引擎渲染（2027-08——完整重构——弹窗独立实例 v2 化）**
      // 段表回传（首帧与 diff 共用 state.segments——段跨渲染复用——工厂不重跑）
      // + requestRender 接父 env（弹窗内容组件 hooks 变化 → 父段请求渲染 →
      // 同步模式父 renderFn 重新构建内容 → handle.update → 弹窗 diff——v1 链等价）
      const cmds = await new Promise<Command[]>((resolve, reject) => {
        const out: Command[] = []
        const req = () => env.requestRender?.()
        const obs = prev
          ? diffV2(prev, content as never, ctx, state.segments, registry, req)
          : renderV2(content as never, ctx, registry, state.segments, req)
        obs.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
      })
      for (const value of cmds) {
        if (state.disposed || v !== state.version) return
        applier.apply(value)
      }
      // **段清理（unmount 命令统一信号——弹窗级段表）**
      for (const value of cmds) {
        if (value.op === 'unmount') disposeSegment(value.compId, state.segments)
      }
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[popup] render error:', e)
    })
  }

  /** 释放（applier + 容器 + 监听——幂等） */
  const disposeInstance = (): void => {
    if (state.disposed) return
    state.disposed = true
    if (state.applier) { state.applier.dispose(); state.applier = null }
    state.tree = null
    if (state.container) { state.container.remove(); state.container = null }
  }

  /** 关闭（presence：exit 动画 → animationend → finalize——否则立即） */
  const finalizeClose = (): void => {
    if (state.disposed) return
    state.open = false
    emitEvent({ kind: 'closed' })
    restoreModalLock()
    disposeInstance()
    emitEvent({ kind: 'disposed' })
    opts.onClose?.()
  }
  const close = (): void => {
    if (!state.open || state.disposed) return
    if (opts.presence) {
      emitEvent({ kind: 'exit' }) // 退场——动画后 finalize（panelRef 监听 animationend）
      // 无动画环境立即 closed（jsdom/无 CSS 动画——animationend 不触发——不挂死）
      if (state.panel && win && !hasAnim(state.panel, win)) finalizeClose()
      // 无面板（未挂载）也立即 closed
      if (!state.panel) finalizeClose()
    } else {
      finalizeClose()
    }
  }

  /** 会话级模态清理（滚动锁恢复 + 焦点归还） */
  const bodyPrevOverflow = { value: '' }
  const trapPrevFocus = { value: null as HTMLElement | null }
  const lockEngaged = { value: false }
  const restoreModalLock = (): void => {
    if (lockEngaged.value) {
      if (doc?.body) doc.body.style.overflow = bodyPrevOverflow.value
      bodyPrevOverflow.value = ''
      if (trapPrevFocus.value) {
        trapPrevFocus.value.focus?.()
        trapPrevFocus.value = null
      }
      lockEngaged.value = false
    }
  }
  const engageModalLock = (): void => {
    lockEngaged.value = true
    if (opts.lockScroll && doc?.body) {
      bodyPrevOverflow.value = doc.body.style.overflow
      doc.body.style.overflow = 'hidden'
    }
    if (opts.trapFocus && win) {
      trapPrevFocus.value = win.document.activeElement as HTMLElement | null
      // **聚焦时序（2026-08——renderFn 窗口副作用归零）**：原 setTimeout(0)
      // 赌「下一 tick 面板已挂载」——每次 openNow 创建 timer（渲染窗口内
      // ——effect guard 报「渲染路径副作用」）+ 时序不确定——改为
      // scheduleAfterRender（渲染完成后确定性聚焦——无 timer 零误报——
      // 语义更正确：面板挂载后聚焦而非下一 tick 碰运气）
      env.scheduleAfterRender(() => {
        // **挂载重试（2027-08——v2 内容渲染链异步实证）**：afterRender 触发
        // 时内容渲染链（state.chain 微任务）可能未执行——panel 未挂载——
        // ref 回调未跑——微任务重试直至挂载（≤10——不无限）
        const tryFocus = (n: number): void => {
          const el = state.panel
          if (el) {
            const f = el.querySelector?.('input, button, [tabindex], select, textarea') as HTMLElement | null
            ;(f ?? el).focus?.()
          } else if (n < 10 && state.open) {
            queueMicrotask(() => tryFocus(n + 1))
          }
        }
        tryFocus(0)
      })
    }
  }

  /** Tab 焦点陷阱（trapFocus——面板内循环） */
  let trapFn: ((e: KeyboardEvent) => void) | null = null
  if (opts.trapFocus && win) {
    trapFn = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !state.open || !state.panel) return
      const focusables = Array.from(state.panel.querySelectorAll?.('input, button, [tabindex], select, textarea') ?? [])
        .filter((el) => !(el as HTMLButtonElement).disabled && (el as HTMLElement).offsetParent !== null) as HTMLElement[]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = win?.document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === state.panel || !state.panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !state.panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    win.addEventListener('keydown', trapFn)
  }

  /** 外部点击关闭（el/panel 外——per-instance 监听——close 时移除） */
  const onDown = (e: MouseEvent): void => {
    if (!state.open || (opts.closeOnOutside ?? true) === false) return
    const t = e.target as Node | null
    const el = resolveAnchor(opts.anchor)
    if (t && el?.contains(t)) return
    if (t && state.panel?.contains(t)) return
    close()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (state.open && (opts.closeOnEscape ?? true) && e.key === 'Escape') close()
  }
  if (win) {
    win.addEventListener('mousedown', onDown)
    win.addEventListener('keydown', onKey)
  }

  /** 卸载清理（组件销毁——句柄存活场景） */
  env.onUnmount(() => {
    if (win) {
      win.removeEventListener('mousedown', onDown)
      win.removeEventListener('keydown', onKey)
      if (trapFn) win.removeEventListener('keydown', trapFn)
    }
    finalizeClose()
  })

  // ── 打开：挂载 + 首帧渲染 ──
  const openNow = (): void => {
    if (state.open || state.disposed) return
    state.open = true
    emitEvent({ kind: 'open' })
    const container = ensureContainer()
    if (!container) return
    if (opts.trapFocus || opts.lockScroll) engageModalLock()
    const registry = createComponentRegistry()
    state.applier = new CommandApplier(container, doc as Document, registry)
    state.segments = new Map() as SegmentMap
    const content = resolveContent(opts.content)
    if (content !== null && content !== undefined) render(buildPanelVn(content as VNode) as VNode)
    else finalizeClose()
  }

  const handle: PopupHandle = {
    close,
    update(content: VNodeChild): void {
      if (state.disposed || !state.open) return
      if (content === null || content === undefined) { close(); return }
      // 自定义坐标同步（position getter——update 前读最新——Slider/ContextMenu）
      let posChanged = false
      if (opts.position) {
        const pv = opts.position()
        if (pv && typeof pv.x === 'number' && typeof pv.y === 'number') { state.pos = { top: pv.y, left: pv.x, width: pv.width }; posChanged = true }
      }
      render(buildPanelVn(content as VNode) as VNode)
      if (posChanged) applyPosToPanel() // 坐标落地（render 用旧 pos 的 style——DOM 同步）
    },
    refresh(): void {
      if (state.disposed || !state.open || !state.tree) return
      if (opts.position) {
        const pv = opts.position()
        if (pv && typeof pv.x === 'number' && typeof pv.y === 'number') {
          state.pos = { top: pv.y, left: pv.x, width: pv.width }
          applyPosToPanel() // **坐标落地（直接 DOM——零渲染——避免
          // buildPanelVn(state.tree) 二次包装嵌套——2027-09 实证**）
        }
      }
    },
    get open() {
      return state.open
    },
    events$,
  }

  openNow()
  return handle
}
