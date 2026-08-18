/**
 * hooks/popup — 弹层 hooks
 *
 * usePopupPosition / usePopup / useOpen
 */

import type { HookEnv } from '../contracts/hooks.ts'
import type {
  PopupPositionOptions,
  PopupPosition,
  PopupTrigger,
  UsePopupOptions,
  UsePopupHandle,
} from '../types.ts'
import { clampToViewport, computeFixedPosRect } from '../popup.ts'
import { createPortal, h } from '../vnode.ts'
import type { VNode } from '../vnode.ts'
import { useHoverCapable, usePresence } from './stable.ts'
import { addGlobalListener, bindElementListener } from '../services/global-events.ts'
import { stream, ev } from '../index.ts'


/** 弹层位置跟踪：滚动/resize 时自动重算 fixed 坐标（0 rect 防护） */
export function usePopupPosition(env: HookEnv, options: PopupPositionOptions): PopupPosition {
  const selfId = env.compId
  const pos: PopupPosition = { top: 0, left: 0, refresh: () => {} }
  if (!selfId) return pos

  const tracker = {
    pos,
    getEl: options.el,
    isOpen: options.isOpen,
    compute: options.compute,
    panel: options.panel,
    margin: options.margin ?? 8,
  }
  env.popupTrackers.set(selfId, tracker)
  env.ensurePopupListeners() // 惰性挂载全局单例监听
  // 卸载清理 tracker（组件销毁后 scroll/resize 重算不再引用已卸载组件）
  const unsub = env.onUnmount(() => {
    env.popupTrackers.delete(selfId); unsub()
  })

  // 手动重算：只更新坐标，不触发渲染（调用方负责 render）
  pos.refresh = () => {
    const el = tracker.getEl()
    if (!el) return
    const r = el.getBoundingClientRect()
    // 0 rect 防护：元素替换中/未布局/隐藏时 rect 全 0——跳过刷新（保留上一坐标）
    if (r.width === 0 && r.height === 0) return
    const p = tracker.compute(r)
    Object.assign(pos, clampToViewport(p, tracker.panel?.(), tracker.margin))
  }
  return pos
}

/**
 * 弹层组合器：收敛 open 状态 + 触发（hover/tap 降级/longpress）+ Escape +
 * 外部点击 + 定位/视口 clamp + portal。
 */
export function usePopup(env: HookEnv, options: UsePopupOptions): UsePopupHandle {
  const selfId = env.compId
  const b = env.browser
  const canHover = useHoverCapable(env)
  const triggerOf = (): PopupTrigger => (typeof options.trigger === 'function' ? options.trigger() : (options.trigger ?? 'manual'))
  const controlled = options.open !== undefined
  const isDisabled = () => !!options.disabled?.()
  const isOpen = () => {
    if (!controlled) return options.isOpen()
    return typeof options.open === 'function' ? !!options.open() : !!options.open
  }

  // ── 会话级模态能力（presence/trap/lock——Modal/Drawer 用，锚定弹层默认全关） ──
  const presence = options.presence ? usePresence(env, { name: (options as any).name }) : null
  let focusCleanup: (() => void) | undefined
  let wasLocked = false
  // render 阶段同步打开状态 → 驱动退场状态机（open → exit → closed），返回当前 phase
  const sync = (open: boolean): 'closed' | 'open' | 'exit' => {
    if (!presence) return open ? 'open' : 'closed'
    const p = presence.sync(open)
    if (open && options.lockScroll && !wasLocked) { lockScroll(); wasLocked = true }
    return p
  }
  const setOpen = (v: boolean) => {
    if (isDisabled()) return
    if (controlled) {
      options.onOpenChange?.(v)
    } else if (presence) {
      if (v) sync(true)
      else if (isOpen()) sync(false) // open → exit（退场动画）
    } else {
      options.setOpen(v)
    }
  }
  const placementOf = () => {
    const p = options.placement
    return typeof p === 'function' ? p() : (p ?? 'bottom')
  }

  // ── 定位（复用 usePopupPosition） ──
  let panelEl: HTMLElement | null = null
  let prevOpen = false
  const pos = usePopupPosition(env, {
    el: (options.el ?? (() => null)) as () => HTMLElement | null,
    isOpen: () => isOpen(),
    compute: (r) => {
      if (options.position) {
        const p = options.position()
        return { top: p.y, left: p.x, width: p.width }
      }
      return computeFixedPosRect(r, placementOf(), options.gap ?? 6, options.center !== false)
    },
    panel: () => panelEl,
    margin: options.margin ?? 8,
  })

  // ── 外部点击关闭（document 级，卸载退订） ──
  const onDocMouseDown = (e: Event) => {
    if (options.closeOnOutside === false) return
    // mask 模式：遮罩接管关闭（全屏 fixed 已覆盖所有点击）——外部点击关闭关闭关闭
    if (options.mask) return
    if (!isOpen()) return
    const target = e.target
    if (!(target instanceof Node)) return
    const el = options.el?.() ?? null
    if (el && el.contains(target)) return
    if (panelEl && panelEl.contains(target)) return
    setOpen(false)
  }
  // ── Escape 关闭 ──
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (options.closeOnEscape === false) return
    if (e.key !== 'Escape' || !isOpen()) return
    setOpen(false)
  }
  // 全局监听统一走事件代理（聚合注册/退订 + 事件流可观测）
  const offMouse = addGlobalListener(b as unknown as EventTarget, 'mousedown', onDocMouseDown as EventListener)
  const offKey = addGlobalListener(b as unknown as EventTarget, 'keydown', onDocKeyDown as EventListener)
  if (selfId) {
    const unsub = env.onUnmount(() => {
      offMouse()
      offKey()
      unsub()
    })
  }

  // ── 触发 props（hover 门控 + tap 降级 + longpress + Escape） ──
  const wrapProps: Record<string, any> = {}
  const delayOf = (d: number | (() => number) | undefined) => (typeof d === 'function' ? d() : (d ?? 0))
  const openDelay = () => delayOf(options.openDelay)
  const closeDelay = () => delayOf(options.closeDelay)
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  const clearHoverTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); openTimer = undefined; closeTimer = undefined }

  // trigger 动态化：统一挂全部 handler，内部分派（triggerOf() 每次调用读最新）
  const hoverOpen = (e: MouseEvent) => {
    if (isDisabled()) return
    const wrap = e.currentTarget as HTMLElement
    const rt = e.relatedTarget as Node | null
    if (wrap.contains(rt)) return
    clearTimeout(closeTimer); closeTimer = undefined
    openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay())
  }
  const hoverClose = (e: MouseEvent) => {
    if (isDisabled()) return
    const wrap = e.currentTarget as HTMLElement
    const rt = e.relatedTarget as Node | null
    if (wrap.contains(rt)) return
    clearTimeout(openTimer); openTimer = undefined
    closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay())
  }
  const focusOpen = () => { if (!isDisabled()) { clearTimeout(closeTimer); closeTimer = undefined; openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay()) } }
  const blurClose = () => { if (!isDisabled()) { clearTimeout(openTimer); openTimer = undefined; closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay()) } }
  const isHover = () => triggerOf() === 'hover'

  // 全部 handler 无条件挂（内部分派）
  wrapProps.onMouseOver = (e: MouseEvent) => { if (isHover()) hoverOpen(e) }
  wrapProps.onMouseOut = (e: MouseEvent) => { if (isHover()) hoverClose(e) }
  wrapProps.onClick = () => {
    if (isHover()) {
      if (!canHover) setOpen(!isOpen()) // 触屏 tap 退化
    } else if (triggerOf() === 'click') {
      setOpen(true) // 只开不关（Select 教训）
    }
  }
  wrapProps.onFocus = () => {
    if (isHover()) focusOpen()
    else if (triggerOf() === 'focus') { clearTimeout(closeTimer); closeTimer = undefined; setOpen(true) }
  }
  wrapProps.onBlur = () => {
    if (isHover()) blurClose()
    else if (triggerOf() === 'focus') {
      // 延迟关闭：面板内 mousedown/click 在 blur 后到达（stopPropagation 防外部点击关）——
      // closeDelay 窗口内完成交互（DatePicker 选中日期的 click 先于关闭生效）
      clearTimeout(openTimer); openTimer = undefined
      closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay())
    }
  }

  if (triggerOf() === 'longpress') {
    let timer: ReturnType<typeof setTimeout> | undefined
    let startX = 0
    let startY = 0
    const clear = () => { clearTimeout(timer); timer = undefined }
    wrapProps.onPointerDown = (e: PointerEvent) => {
      if (isDisabled()) return
      startX = e.clientX ?? 0
      startY = e.clientY ?? 0
      clear()
      timer = setTimeout(() => {
        timer = undefined
        options.onTrigger?.({ clientX: startX, clientY: startY })
        setOpen(true)
      }, options.longPressDuration ?? 500)
    }
    wrapProps.onPointerUp = clear
    wrapProps.onPointerLeave = clear
    wrapProps.onPointerMove = (e: PointerEvent) => {
      const dx = Math.abs((e.clientX ?? 0) - startX)
      const dy = Math.abs((e.clientY ?? 0) - startY)
      if (dx > 10 || dy > 10) clear()
    }
    wrapProps.onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      options.onTrigger?.({ clientX: e.clientX ?? 0, clientY: e.clientY ?? 0 })
      setOpen(true)
    }
  }

  wrapProps.onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && options.closeOnEscape !== false) setOpen(false)
  }
  // 组件卸载时清理悬停计时器
  if (selfId) {
    const unsub = env.onUnmount(() => { clearHoverTimers(); unsub() })
  }

  // ── 面板元素捕获（视口夹紧用；动画结束后重算坐标） ──
  const panelRef = (el: HTMLElement | null) => {
    if (el) {
      panelEl = el
      // 动画监听统一走事件代理（once 自动解绑——EVENT_UNBIND 可观测）
      const settle = () => pos.refresh()
      bindElementListener(el, 'animationend', settle as EventListener, true)
    } else {
      panelEl = null
    }
  }

  // ── portal：定位 + 宽度 clamp + 打开/锚点变化瞬间重算坐标 ──
  let lastEl: HTMLElement | null = null
  let latestContentRef: ((el: HTMLElement | null) => void) | null = null
  const portalPanelRef = (el: HTMLElement | null) => {
    panelRef(el)
    if (latestContentRef) latestContentRef(el)
    // 模态能力接线（presence 退场监听 / trap 锁定归还 / lock 释放）
    presence?.ref(el)
    if (options.trapFocus) {
      if (el) focusCleanup = trapFocus(el as HTMLElement)
      else { focusCleanup?.(); focusCleanup = undefined }
    }
    if (options.lockScroll && !el && wasLocked) { unlockScroll(); wasLocked = false }
  }
  const portal = (content: VNode | null, portalKey = 'popover'): VNode | null => {
    if (isDisabled()) return null
    // presence 模式：exit 阶段仍需渲染（退场动画）——用 phase 而非 isOpen
    const now = presence ? presence.phase !== 'closed' : isOpen()
    if (!now) { prevOpen = false; lastEl = null; return null }
    const el = options.el?.() ?? null
    if (!prevOpen || el !== lastEl) {
      if (el) {
        pos.refresh()
      } else {
        queueMicrotask(() => { if (isOpen()) pos.refresh() })
      }
      prevOpen = true
      lastEl = el
    }
    const props = ((content ?? h('span')).props ?? {}) as Record<string, any>
    if (!content) return null
    latestContentRef = (props.ref as ((el: HTMLElement | null) => void) | null) ?? null
    // positioning 'none'（Modal/Drawer 自定义定位）：不附加 wf-popup（其 max-width:480px
    // 会限制 .wf-modal/.wf-drawer 的 inset:0 全屏尺寸——flex 居中失效）
    const cls = options.positioning === 'none'
      ? (props.class ?? '')
      : ['wf-popup', props.class].filter(Boolean).join(' ')
    // positioning 'none'：组件自定义定位（Modal 的 .wf-modal inset:0、Toast 的 CSS 角落）——
    // 只 position: fixed，不加坐标
    const style = options.positioning === 'none'
      ? { ...(props.style ?? {}), position: 'fixed' }
      : {
          ...(props.style ?? {}),
          position: 'fixed',
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          ...(pos.width !== undefined ? { width: `${pos.width}px` } : {}),
          maxWidth: (() => {
            const w = typeof options.width === 'function' ? options.width() : options.width
            return w !== undefined ? `min(${w}px, calc(100vw - 32px))` : 'calc(100vw - 32px)'
          })(),
        }
    const panel = {
      ...content,
      props: {
        ...props,
        class: cls,
        style,
        ref: portalPanelRef,
      },
    } as VNode
    // mask 模式：渲染全屏遮罩 + 面板（遮罩 z-index=--wf-z-overlay < 面板 --wf-z-popover）。
    // 面板显式 z-index 高于遮罩（否则遮罩覆盖面板）；遮罩点击关闭（maskClosable 门控）。
    if (options.mask) {
      // 自定义 mask（Tour 挖洞高亮遮罩）——交互组件自控，不自动 onClick
      const maskEl = typeof options.mask === 'object'
        ? options.mask
        : h('div', {
            class: 'wf-popup-mask',
            'data-portal-mask': portalKey,
            onClick: options.maskClosable === false ? undefined : () => setOpen(false),
          })
      // maskCentered：外包全屏居中容器——用 layout 原语 .wf-cover（AGENTS.md §8：
      // 先查框架原语不重复造轮子——position:fixed+inset:0+flex 居中已提供），
      // --wf-z 覆盖为面板层（遮罩 80 < 面板 120）；不能把 flex 加到 content 自身
      // （<img> 替换元素 display:flex 无效）。容器 pointer-events:none 透明区穿透
      // 到遮罩关闭，子元素 auto 接收点击（缩放）
      const centeredWrap = options.maskCentered
        ? h('div', {
            // layout 原语 .wf-cover：全屏居中（AGENTS.md §8 先查框架原语）
            class: 'wf-cover',
            style: { '--wf-z': 'var(--wf-z-popover)', pointerEvents: 'none' },
          }, {
            ...panel,
            props: {
              ...panel.props,
              style: { ...(props.style ?? {}), pointerEvents: 'auto' },
              ref: portalPanelRef,
            },
          } as VNode)
        : null
      const maskStyle = options.maskCentered
        ? undefined
        : { ...(panel.props?.style ?? {}), zIndex: 'var(--wf-z-popover)' }
      const maskedPanel = options.maskCentered ? centeredWrap : {
        ...panel,
        props: {
          ...panel.props,
          style: maskStyle,
        },
      } as VNode
      return createPortal([maskEl, maskedPanel], portalKey)
    }
    return createPortal(panel, portalKey)
  }

  return {
    get open() { return isOpen() },
    setOpen,
    get phase() { return presence ? presence.phase : (isOpen() ? 'open' : 'closed') },
    sync,
    wrapProps,
    portal,
    refresh: () => pos.refresh(),
  }
}

/** 显隐打开状态机（C4）：trigger/focus/blur 协调。默认只开不关 */
export function useOpen(env: HookEnv, options: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  openOnFocus?: boolean
  name?: string
}) {
  const selfId = env.compId
  // render 阶段调用——非受控内部态 Map 缓存跨渲染保持
  if (selfId && !env.openStates.has(selfId)) {
    env.openStates.set(selfId, false)
    const unsub = env.onUnmount(() => { env.openStates.delete(selfId); unsub() })
  }
  const controlled = options.open !== undefined
  // 受控缺回调 warn（对齐 useControlled）
  if (controlled && !options.onOpenChange && options.name && !env.warned.has(options.name)) {
    env.warned.add(options.name)
    console.warn(
      `[weifuwu/${options.name}] 受控模式（open 已传）但未提供 onOpenChange，交互无法生效。\n` +
      `非受控：去掉 open；受控：传入 onOpenChange={(o) => setOpen(o)}`
    )
  }
  const isOpen = () => (controlled ? !!options.open : (selfId ? env.openStates.get(selfId) ?? false : false))
  const dirty = () => {
    if (selfId) env.requestRender()
    else env.requestRender()
  }
  const setOpen = (v: boolean) => {
      if (controlled) { options.onOpenChange?.(v); return }
    if (selfId) env.openStates.set(selfId, v)
    dirty()
  }
  return {
    get open() { return isOpen() },
    setOpen,
    triggerProps: {
      onClick: () => setOpen(true),
      onFocus: () => { if (options.openOnFocus) setOpen(true) },
    },
  }
}

/** 全屏对话框组合器：退场状态机 + 滚动锁 + 焦点 trap（基于 usePresence） */


// ══ 会话级模态内部实现（usePopup presence/trapFocus/lockScroll 专用——不对外导出） ══

import { createClientBrowser } from '../browser.ts'
const _browser = createClientBrowser()

let lockedCount = 0
let originalOverflow = ''
let originalPosition = ''
let originalTop = ''
let originalWidth = ''
let scrollY = 0

function canLock(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/** 测试隔离：重置滚动锁状态（node --test 并发——模块级 lockedCount 跨文件共享） */
export function __resetPopupLockState(): void {
  lockedCount = 0
  originalOverflow = ''
}

function lockScroll(): void {
  lockedCount++
  // 组件副作用事件：滚动锁（effect:lock——锁 body 滚动——可观测）
  stream.emit(ev('effect', 'lock', undefined, { depth: lockedCount }))
  if (lockedCount > 1) return
  if (!canLock()) return

  scrollY = _browser.scrollTop()
  const body = _browser.bodyElement() as HTMLElement
  originalOverflow = body.style.overflow
  originalPosition = body.style.position
  originalTop = body.style.top
  originalWidth = body.style.width

  body.style.overflow = 'hidden'

  const isIOS = /iPhone|iPad|iPod/.test(navigator.platform) ||
    (/Mac/.test(navigator.platform) && 'ontouchend' in document)
  if (isIOS) {
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
  }
}

function unlockScroll(): void {
  // 下溢防护：未锁定时 unlock 是 no-op（防 lockedCount 走负数后
  // 错误还原 style / scrollTo 覆盖其他锁定者）
  if (lockedCount === 0) return
  lockedCount--
  // 组件副作用事件：滚动锁释放（effect:unlock——可观测）
  stream.emit(ev('effect', 'unlock', undefined, { depth: lockedCount }))
  if (lockedCount > 0) return
  if (!canLock()) return

  const body = _browser.bodyElement() as HTMLElement
  body.style.overflow = originalOverflow
  body.style.position = originalPosition
  body.style.top = originalTop
  body.style.width = originalWidth

  if (scrollY > 0) _browser.scrollTo(scrollY)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapFocus(container: HTMLElement): () => void {
  let cleanup: (() => void) | undefined
  // §5.1：ref 在子节点 appendChild 之前触发——容器挂载时 children 未连接，
  // querySelectorAll 查不到可聚焦元素（真实事故：handler 不注册 → Tab 循环失效）。
  // 延迟到微任务：同任务内 mount 已完成，元素已连接、children 完整。
  queueMicrotask(() => {
    const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey && _browser.activeElement() === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && _browser.activeElement() === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const prevFocused = _browser.activeElement() as HTMLElement | null
    // 组件副作用事件：焦点 trap 开始（effect:focus——焦点圈入——可观测）
    stream.emit(ev('effect', 'focus', undefined, { mode: 'trap-start' }))
    first.focus()

    // 焦点 trap 的容器键盘——统一走事件代理（聚合注册/退订 + 事件流可观测）
    const offKey = addGlobalListener(container, 'keydown', handler as EventListener)
    cleanup = () => {
      offKey()
      // 组件副作用事件：焦点归还（effect:focus——trap 退出——可观测）
      stream.emit(ev('effect', 'focus', undefined, { mode: 'restore' }))
      prevFocused?.focus()
    }
  })
  return () => cleanup?.()
}
