/**
 * hooks/popup — 弹层 hooks
 *
 * usePopupPosition / usePopup / useOpen / useDialog
 */

import type { HookEnv } from './types.ts'
import type {
  PopupPositionOptions,
  PopupPosition,
  UsePopupOptions,
  UsePopupHandle,
} from '../types.ts'
import { clampToViewport, computeFixedPosRect } from '../popup.ts'
import { createPortal } from '../vnode.ts'
import type { VNode } from '../vnode.ts'
import { lockScroll, unlockScroll } from '../scroll-lock.ts'
import { trapFocus } from '../focus-trap.ts'
import { usePresence } from './stable.ts'
import { useHoverCapable } from './stable.ts'

/** 弹层位置跟踪：滚动/resize 时自动重算 fixed 坐标（0 rect 防护） */
export function usePopupPosition(env: HookEnv, options: PopupPositionOptions): PopupPosition {
  const selfId = env.selfId()
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
  const selfId = env.selfId()
  const b = env.browser
  const canHover = useHoverCapable(env)
  const triggerOf = () => (typeof options.trigger === 'function' ? options.trigger() : options.trigger)
  const controlled = options.open !== undefined
  const isDisabled = () => !!options.disabled?.()
  const isOpen = () => {
    if (!controlled) return options.isOpen()
    return typeof options.open === 'function' ? !!options.open() : !!options.open
  }
  const setOpen = (v: boolean) => {
    if (isDisabled()) return
    if (controlled) {
      options.onOpenChange?.(v)
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
    el: options.el,
    isOpen: () => isOpen(),
    compute: (r) => {
      if (options.position) {
        const p = options.position()
        return { top: p.y, left: p.x }
      }
      return computeFixedPosRect(r, placementOf(), options.gap ?? 6, options.center !== false)
    },
    panel: () => panelEl,
    margin: options.margin ?? 8,
  })

  // ── 外部点击关闭（document 级，卸载退订） ──
  const onDocMouseDown = (e: Event) => {
    if (options.closeOnOutside === false) return
    if (!isOpen()) return
    const target = e.target
    if (!(target instanceof Node)) return
    const el = options.el()
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
  b.addEventListener('mousedown', onDocMouseDown)
  b.addEventListener('keydown', onDocKeyDown)
  if (selfId) {
    const unsub = env.onUnmount((id) => {
      if (id === selfId) {
        b.removeEventListener('mousedown', onDocMouseDown)
        b.removeEventListener('keydown', onDocKeyDown)
        unsub()
      }
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
  wrapProps.onFocus = () => { if (isHover()) focusOpen() }
  wrapProps.onBlur = () => { if (isHover()) blurClose() }

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
    const unsub = env.onUnmount((id) => { if (id === selfId) { clearHoverTimers(); unsub() } })
  }

  // ── 面板元素捕获（视口夹紧用；动画结束后重算坐标） ──
  const panelRef = (el: HTMLElement | null) => {
    if (el) {
      panelEl = el
      const settle = () => pos.refresh()
      el.addEventListener('animationend', settle, { once: true })
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
  }
  const portal = (content: VNode, portalKey = 'popover'): VNode | null => {
    if (isDisabled()) return null
    const now = isOpen()
    if (!now) { prevOpen = false; lastEl = null; return null }
    const el = options.el()
    if (!prevOpen || el !== lastEl) {
      if (el) {
        pos.refresh()
      } else {
        queueMicrotask(() => { if (isOpen()) pos.refresh() })
      }
      prevOpen = true
      lastEl = el
    }
    const props = (content.props ?? {}) as Record<string, any>
    latestContentRef = (props.ref as ((el: HTMLElement | null) => void) | null) ?? null
    const cls = ['wf-popup', props.class].filter(Boolean).join(' ')
    const style = {
      ...(props.style ?? {}),
      position: 'fixed',
      top: `${pos.top}px`,
      left: `${pos.left}px`,
      maxWidth: options.width !== undefined
        ? `min(${options.width}px, calc(100vw - 32px))`
        : 'calc(100vw - 32px)',
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
    return createPortal(panel, portalKey)
  }

  return {
    get open() { return isOpen() },
    setOpen,
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
  const selfId = env.selfId()
  // render 阶段调用——非受控内部态 Map 缓存跨渲染保持
  if (selfId && !env.openStates.has(selfId)) {
    env.openStates.set(selfId, false)
    const unsub = env.onUnmount((id) => { if (id === selfId) { env.openStates.delete(selfId); unsub() } })
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
    if (selfId) env.render([selfId])
    else env.render()
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
export function useDialog(env: HookEnv, options?: { name?: string }) {
  const selfId = env.selfId()
  let focusCleanup: (() => void) | undefined
  let panelEl: HTMLElement | null = null
  // 状态机复用 usePresence（open → exit → closed + animationend 卸载）
  const presence = usePresence(env, options)

  const rootRef = (el: HTMLElement | null) => {
    if (el) {
      lockScroll()
      if (panelEl) focusCleanup = trapFocus(panelEl as HTMLElement)
      presence.ref(el)
    } else {
      unlockScroll()
      focusCleanup?.()
      presence.ref(null)
    }
  }

  const panelRef = (el: HTMLElement | null) => {
    panelEl = el
    // panel 后挂（root 先连）时补 trap
    if (el && !focusCleanup) {
      focusCleanup = trapFocus(el as HTMLElement)
    }
  }

  void selfId
  return {
    get phase() { return presence.phase },
    rootRef,
    panelRef,
    sync: (open: boolean) => presence.sync(open),
  }
}
