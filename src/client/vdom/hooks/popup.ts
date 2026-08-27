/**
 * vdom hooks — usePopup（浮层弹窗——28 个浮层组件的核心依赖）
 *
 * 能力（设计规则 §5.4——弹窗纪律）：
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

import type { HookEnv } from './env.ts'

export type PopupPlacement = 'top' | 'bottom' | 'left' | 'right'

export type PopupPhase = 'closed' | 'open' | 'exit'
/** Placement 别名（ui-dom 兼容——HoverCard/Popover/Tooltip 消费） */
export type Placement = PopupPlacement

export function computePos(
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
      // center（默认 true）：垂直居中于锚点（Tooltip 左右方向用户实测——
      // 顶部对齐 vs 按钮中心对不上——统一 center 语义：水平+垂直都居中）
      top = center ? r.top + r.height / 2 - panelH / 2 : r.top
      left = r.left - panelW - gap
      break
    case 'right':
      top = center ? r.top + r.height / 2 - panelH / 2 : r.top
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

/** 动画检查（根 + 直接子元素——Modal/Drawer 动画在子元素——jsdom 无动画） */
export function hasAnim(el: HTMLElement, win: Window): boolean {
  const self = win.getComputedStyle(el).animationName
  if (self && self !== 'none') return true
  for (const c of el.children) {
    const n = win.getComputedStyle(c as HTMLElement).animationName
    if (n && n !== 'none') return true
  }
  return false
}

/** 锚点解析（**el 优先**——真实 bug：`trigger ?? el` 让 trigger 字符串
 * （'click'——触发方式装饰——vdom 组件显式 setOpen 驱动）优先——el getter
 * 被忽略——refresh 锚点恒 null——浮层定位 0,0（左上角——agent-browser
 * 实测 Dropdown 面板 rect 0,0）——ui-dom 语义：el 是锚点，trigger 是方式） */
export interface PopupPositionOptions {
  /** 锚点元素（函数——ref 挂载后可用） */
  el: () => HTMLElement | null
  /** 是否打开（关闭时跳过重算） */
  isOpen?: () => boolean
  /** 重算回调（rect → 坐标）——Affix 阈值/宽度重算等 */
  compute: (r: DOMRect) => { top: number; left: number }
  /** 面板元素（视口夹紧用） */
  panel?: () => HTMLElement | null
  margin?: number
}

/** 弹层位置跟踪：scroll/resize 时自动重算 fixed 坐标（0 rect 防护） */
export function usePopupPosition(env: HookEnv, options: PopupPositionOptions) {
  const win = env.getBrowser()?.window
  // **对象 getter（2026-08）**：top/left 读时求值——mount 闭包持有 pos
  // 永远最新（旧快照属性：mount 闭包读一次冻结——Affix 类组件依赖
  // renderFn 重读——getter 化后无位置概念）
  let top = 0
  let left = 0
  const pos = {
    get top() { return top },
    get left() { return left },
    refresh: () => {},
  }

  const refresh = (): void => {
    const el = options.el()
    if (!el) return
    const r = el.getBoundingClientRect()
    // 0 rect 防护：元素替换中/未布局/隐藏时 rect 全 0——跳过刷新（保留上一坐标）
    if (r.width === 0 && r.height === 0) return
    const p = options.compute(r)
    top = p.top
    left = p.left
  }

  // scroll（捕获——容器滚动也收到）/resize 全局监听 + rAF 节流
  let raf: number | undefined
  const schedule = (): void => {
    if (raf) return
    if (!win) return
    raf = win.requestAnimationFrame(() => {
      raf = undefined
      if (options.isOpen?.() ?? true) refresh()
    })
  }
  if (win) {
    win.addEventListener('scroll', schedule, true)
    win.addEventListener('resize', schedule)
    env.onUnmount(() => {
      if (raf !== undefined) win.cancelAnimationFrame(raf)
      win.removeEventListener('scroll', schedule, true)
      win.removeEventListener('resize', schedule)
    })
  }

  // 手动重算：只更新坐标，不触发渲染（调用方负责 render）
  pos.refresh = refresh
  return pos
}
