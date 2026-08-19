/**
 * vdom hooks — usePopup（浮层弹窗——28 个浮层组件的核心依赖）
 *
 * 能力（AGENTS §5.4——弹窗纪律）：
 * - **portal**：popup.portal(content, key)——createPortal 到 #__wf_portal +
 *   fixed 定位 + 视口夹紧（禁止 absolute 相对父容器）
 * - **定位**：placement（top/bottom/left/right）+ center:false 左对齐 +
 *   gap/margin——打开时 refresh + 锚点变化自动重算
 * - **el-null fallback**：锚点首帧未挂载——微任务重试
 * - **外部点击关闭**：document mousedown——el/panel 外点击关闭
 *   （禁止自建 overlay 遮罩——会挡按钮）
 * - **Escape 关闭**：document keydown
 * - **open getter**：渲染期读最新（非创建时快照）
 * - **panelRef 稳定**：ref 回调稳定引用（mount 作用域定义）
 *
 * 会话级模态（presence/焦点 trap/滚动锁——Modal/Drawer）后续实现。
 */

import type { VNode, VNodeChild } from '../core/vnode.ts'
import { createPortal } from '../core/node/portal.ts'
import { useOpen, useStableRef, useGlobalKey, type OpenState, type StableRef } from './basic.ts'
import type { HookEnv } from './env.ts'

export type PopupPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface PopupOptions {
  /** 锚点元素（或 getter——嵌套弹层首帧未挂载场景） */
  trigger?: HTMLElement | (() => HTMLElement | null)
  placement?: PopupPlacement
  /** 左对齐（默认居中于锚点） */
  center?: boolean
  /** 锚点与面板间距 */
  gap?: number
  /** 视口边距（夹紧） */
  margin?: number
  /** 受控（父独占——setOpen 唯一出口） */
  isOpen?: boolean
  setOpen?: (open: boolean) => void
}

export interface Popup {
  /** open getter（渲染期读最新） */
  open: boolean
  /** 打开/关闭 */
  setOpen(open: boolean): void
  /** portal 输出（open 时 → createPortal——关闭 → null） */
  portal(content: VNodeChild, key?: string): VNode | null
  /** 重算坐标（打开后/锚点变化） */
  refresh(): void
  /** panel ref（稳定回调——组件挂到 portal 根元素） */
  panelRef(el: HTMLElement | null): void
  /** 坐标 getter（渲染期读——panel style 应用——refresh 后重渲染） */
  pos: { top: number; left: number }
}

/** 定位计算（锚点 rect → fixed 坐标——视口夹紧——0-rect 防护） */
function computePos(
  el: HTMLElement, win: Window, panelW: number, panelH: number,
  placement: PopupPlacement, gap: number, margin: number, center: boolean,
): { top: number; left: number } | null {
  const r = el.getBoundingClientRect()
  // 0-rect 防护（scroll/ref 间隙——保留上一坐标——A.4 教训）
  if (r.width === 0 && r.height === 0) return null
  const winW = win.innerWidth
  const winH = win.innerHeight
  let top: number
  let left: number
  switch (placement) {
    case 'bottom':
      top = r.bottom + gap
      left = center ? r.left + r.width / 2 - panelW / 2 : r.left
      break
    case 'top':
      top = r.top - panelH - gap
      left = center ? r.left + r.width / 2 - panelW / 2 : r.left
      break
    case 'left':
      top = r.top
      left = r.left - panelW - gap
      break
    case 'right':
      top = r.top
      left = r.right + gap
      break
  }
  // 视口夹紧
  if (left + panelW > winW - margin) left = winW - panelW - margin
  if (left < margin) left = margin
  if (top + panelH > winH - margin) top = winH - panelH - margin
  if (top < margin) top = margin
  return { top, left }
}

/** usePopup（渲染期调用——renderFn 内 ctx.ui.usePopup） */
export function usePopup(env: HookEnv, opts: PopupOptions): Popup {
  const open: OpenState = useOpen(env, false, { open: opts.isOpen, onOpenChange: opts.setOpen })
  const pos: StableRef<{ top: number; left: number }> = useStableRef(env, { top: 0, left: 0 })
  const panel: StableRef<HTMLElement | null> = useStableRef(env, null)
  const win = env.getBrowser()?.window

  const placement = opts.placement ?? 'bottom'
  const gap = opts.gap ?? 8
  const margin = opts.margin ?? 8
  const center = opts.center ?? true

  /** 重算坐标（锚点 rect + 面板尺寸——0-rect 防护——el-null 微任务重试限次） */
  let retries = 0
  const refresh = (): void => {
    const el = typeof opts.trigger === 'function' ? opts.trigger() : opts.trigger
    if (!el || !panel.current) {
      // el-null fallback（嵌套弹层首帧锚点未挂载——限次重试——防无限微任务循环）
      if (retries++ < 10) queueMicrotask(refresh)
      return
    }
    if (!win) return
    const pw = panel.current.offsetWidth || panel.current.getBoundingClientRect().width
    const ph = panel.current.offsetHeight || panel.current.getBoundingClientRect().height
    const p = computePos(el, win, pw, ph, placement, gap, margin, center)
    if (!p) {
      // 0-rect（scroll/ref 间隙——限次重试）
      if (retries++ < 10) queueMicrotask(refresh)
      return
    }
    retries = 0
    pos.current = p
    env.requestRender() // 坐标落地（面板 style 更新）
  }

  /** 打开变化检测（渲染期——打开后微任务定位——面板已挂载） */
  const openIdx = env.nextHookIndex()
  const prev = env.getHookState<{ open: boolean; registered: boolean }>(openIdx) ?? { open: false, registered: false }
  if (prev.open !== open.open) {
    prev.open = open.open
    if (open.open) queueMicrotask(refresh)
  }
  env.setHookState(openIdx, prev)

  /** Escape 关闭（常驻——open 时生效） */
  useGlobalKey(env, 'Escape', () => {
    if (open.open) open.setOpen(false)
  })

  /** 外部点击关闭（常驻监听——open 时生效——el/panel 外关闭） */
  const downIdx = env.nextHookIndex()
  const downState = env.getHookState<{ fn: ((e: MouseEvent) => void) | null }>(downIdx) ?? { fn: null }
  if (!downState.fn && win) {
    const onDown = (e: MouseEvent): void => {
      if (!open.open) return
      const t = e.target as Node | null
      const el = typeof opts.trigger === 'function' ? opts.trigger() : opts.trigger
      if (t && el?.contains(t)) return
      if (t && panel.current?.contains(t)) return
      open.setOpen(false)
    }
    win.addEventListener('mousedown', onDown)
    env.onUnmount(() => win.removeEventListener('mousedown', onDown))
    downState.fn = onDown
  }
  env.setHookState(downIdx, downState)

  return {
    get open() {
      return open.open
    },
    setOpen(v: boolean): void {
      open.setOpen(v)
    },
    portal(content: VNodeChild, key?: string): VNode | null {
      return open.open ? createPortal(content, key ?? 'popup') : null
    },
    get pos() {
      return pos.current
    },
    refresh,
    panelRef(el: HTMLElement | null): void {
      panel.current = el
      if (el && open.open) queueMicrotask(refresh) // 面板挂载 → 定位
    },
  }
}
