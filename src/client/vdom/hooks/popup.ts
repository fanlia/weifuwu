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

import type { VNode, VNodeChild } from '../core/vnode.ts'
import { h } from '../core/vnode.ts'
import { createPortal } from '../core/node/portal.ts'
import { useOpen, useStableRef, useGlobalKey, type OpenState, type StableRef } from './basic.ts'
import type { HookEnv } from './env.ts'

export type PopupPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface PopupOptions {
  /** 锚点元素（或 getter——嵌套弹层首帧未挂载场景；字符串 = 触发方式
   *  装饰性（ui-dom 兼容——vdom 由组件显式 setOpen 驱动——忽略））
   *  el：ui-dom 兼容别名（同 trigger） */
  trigger?: HTMLElement | (() => HTMLElement | null | string) | string
  el?: HTMLElement | (() => HTMLElement | null | string)
  placement?: PopupPlacement | (() => PopupPlacement)
  /** position（ui-dom 兼容：placement 别名 或 自定义坐标 getter——
   *  函数返回 {x,y} = 组件自定坐标（positioning 'none' 语义）） */
  position?: PopupPlacement | (() => PopupPlacement) | (() => { x: number; y: number })
  /** 左对齐（默认居中于锚点） */
  center?: boolean
  /** 锚点与面板间距 */
  gap?: number
  /** 视口边距（夹紧） */
  margin?: number
  /** 受控（父独占——setOpen 唯一出口——ui-dom 兼容函数形状） */
  isOpen?: boolean | (() => boolean)
  setOpen?: (open: boolean) => void
  /** 会话级模态（Modal/Drawer 同款——退场状态机 open→exit→closed——
   *  presence 时 portal 在 exit 阶段仍渲染（退场动画）） */
  presence?: boolean
  /** 会话级模态四件套（ui-dom 兼容——trapFocus 焦点陷阱/lockScroll 滚动锁） */
  trapFocus?: boolean
  lockScroll?: boolean
  /** 外部点击/ESC 关闭开关（ui-dom 兼容——危险操作防误触——Confirm 默认 false） */
  closeOnOutside?: boolean
  closeOnEscape?: boolean
  /** 触发禁用（ui-dom 兼容——渲染期 getter 形状） */
  disabled?: boolean | (() => boolean)
  /** hover 延迟（ui-dom 兼容——渲染期 getter——vdom 无 hover 自动触发——记录用） */
  openDelay?: number | (() => number)
  closeDelay?: number | (() => number)
  /** open 渲染期 getter（ui-dom 兼容——同 isOpen） */
  open?: boolean | (() => boolean)
  onOpenChange?: (v: boolean) => void
  /** 遮罩（ui-dom 兼容——Img preview 等轻量居中弹层） */
  mask?: boolean
  maskCentered?: boolean
  /** 遮罩点击关闭（ui-dom 兼容——危险操作防误触——Confirm 默认 false） */
  maskClosable?: boolean
  /** 触发回调（ui-dom 兼容——ContextMenu 自管 contextmenu——渲染期注册） */
  onTrigger?: (e: MouseEvent) => void
  /** 定位模式（none = 组件自定义定位——.wf-modal inset:0 居中） */
  positioning?: 'anchor' | 'none'
}

export type PopupPhase = 'closed' | 'open' | 'exit'
/** Placement 别名（ui-dom 兼容——HoverCard/Popover/Tooltip 消费） */
export type Placement = PopupPlacement

export interface Popup {
  /** open getter（渲染期读最新） */
  open: boolean
  /** 打开/关闭 */
  setOpen(open: boolean): void
  /** 触发回调（ui-dom 兼容——ContextMenu 自管 contextmenu 事件） */
  onTrigger?(e: Event): void
  /** portal 输出（open 时 → createPortal；presence 时 exit 阶段仍渲染——
   *  退场动画——否则关闭 → null） */
  portal(content: VNodeChild, key?: string): VNode | null
  /** 重算坐标（打开后/锚点变化） */
  refresh(): void
  /** panel ref（稳定回调——组件挂到 portal 根元素） */
  panelRef(el: HTMLElement | null): void
  /** 坐标 getter（渲染期读——panel style 应用——refresh 后重渲染） */
  pos: { top: number; left: number }
  /** presence 阶段（会话级模态——渲染期读：open→exit→closed） */
  phase: PopupPhase
  /** 渲染期同步（presence 状态机驱动——open 变化检测）——返回当前相位
   *  （ui-dom 兼容：`const phase = popup.sync(open)`——组件读渲染分支） */
  sync(open: boolean): PopupPhase
  /** 触发器包装属性（ui-dom 兼容——组件 spread 到 trigger 元素——空对象：
   *  vdom 组件自管触发（setOpen 显式驱动）——无自动触发包装） */
  wrapProps: Record<string, unknown>
}

/** 定位计算（锚点 rect → fixed 坐标——视口夹紧——0-rect 防护） */
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
function resolveTrigger(opts: PopupOptions): HTMLElement | null {
  const t = opts.el ?? opts.trigger
  if (!t) return null
  const el = typeof t === 'function' ? t() : t
  return typeof el === 'string' ? null : el
}

/** usePopup（渲染期调用——renderFn 内 ctx.ui.usePopup） */
export function usePopup(env: HookEnv, opts: PopupOptions): Popup {
  // isOpen 解析（ui-dom 兼容：函数 = 渲染期 getter；布尔 = 受控值；
  // **未传 = 非受控**——内部状态——popup.setOpen 驱动——测试/组件缺省场景）
  const isOpenFn = typeof opts.isOpen === 'function' ? opts.isOpen : undefined
  const isOpenVal = typeof opts.isOpen === 'boolean' ? opts.isOpen : undefined
  const controlled: { open?: boolean; onOpenChange?: (v: boolean) => void } | undefined =
    isOpenFn || isOpenVal !== undefined
      ? { get open() { return isOpenFn ? isOpenFn() : isOpenVal }, onOpenChange: opts.setOpen }
      : undefined
  const open: OpenState = useOpen(env, false, controlled)
  // useStableRef 双形状（容器 | ref 回调）——popup 内部用容器形状
  const pos = useStableRef(env, { top: 0, left: 0 }) as StableRef<{ top: number; left: number }>
  const panel = useStableRef(env, null) as StableRef<HTMLElement | null>
  const win = env.getBrowser()?.window

  // placement 函数解析（ui-dom 兼容——渲染期 getter）
  const placement = typeof opts.placement === 'function' ? opts.placement() : (opts.placement ?? 'bottom')
  const gap = opts.gap ?? 8
  const margin = opts.margin ?? 8
  const center = opts.center ?? true

  // ── hover trigger（真实缺口修复：HoverCard/Tooltip 依赖 trigger:'hover'
  // 语义——vdom 曾无 hover 自动触发（wrapProps 仅 onClick——hover 组件只能
  // 点击切换——悬停卡片/提示永不出现）——mouseenter/mouseleave + 延迟驱动） ──
  const isHoverTrigger = opts.trigger === 'hover'
  let hoverTimer: ReturnType<Window['setTimeout']> | null = null
  const resolveDelay = (d: number | (() => number) | undefined): number =>
    typeof d === 'function' ? d() : (d ?? 0)
  const clearHoverTimer = (): void => {
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null }
  }
  const hoverOpen = (): void => {
    clearHoverTimer()
    if (typeof opts.disabled === 'function' ? opts.disabled() : opts.disabled) return
    hoverTimer = (win?.setTimeout ?? window.setTimeout)(() => {
      hoverTimer = null
      if (!open.open) open.setOpen(true)
    }, resolveDelay(opts.openDelay))
  }
  const hoverClose = (): void => {
    clearHoverTimer()
    hoverTimer = (win?.setTimeout ?? window.setTimeout)(() => {
      hoverTimer = null
      if (open.open) open.setOpen(false)
    }, resolveDelay(opts.closeDelay))
  }
  // 卸载清理（hover 定时器泄漏——mount 常驻组件）
  env.onUnmount(clearHoverTimer)

  /** 重算坐标（锚点 rect + 面板尺寸——0-rect 防护——el-null 微任务重试限次） */
  let retries = 0
  const refresh = (): void => {
    const el = resolveTrigger(opts)
    if (!el || !panel.current) {
      // el-null fallback（嵌套弹层首帧锚点未挂载——限次重试——防无限微任务循环）
      if (retries++ < 10) queueMicrotask(refresh)
      return
    }
    if (!win) return
    // **position 自定义坐标（真实缺口）**：函数返回 {x,y}——组件自定坐标
    // （positioning 'none' 语义——Img 预览等覆盖 computePos）——无需面板尺寸
    if (typeof opts.position === 'function') {
      const pv = opts.position()
      if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
        const c = pv as { x: number; y: number }
        if (typeof c.x === 'number' && typeof c.y === 'number') {
          pos.current = { top: c.y, left: c.x }
          env.requestRender()
          return
        }
      }
    }
    const pw = panel.current.offsetWidth || panel.current.getBoundingClientRect().width
    const ph = panel.current.offsetHeight || panel.current.getBoundingClientRect().height
    // **面板未布局重试（真实 bug）**：ref 在 appendChild 前触发——首帧
    // panelH/W = 0——top/left 定位只偏移 gap（面板覆盖按钮）——rAF 优先
    // （微任务在帧边界前——布局未计算——offsetHeight 恒 0——10 次重试全
    // 在布局前耗尽）——rAF 后布局就绪（限次——防无限循环）
    if ((pw === 0 || ph === 0) && retries++ < 10) {
      if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(refresh)
      else queueMicrotask(refresh)
      return
    }
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

  /** panelRef 实现（局部函数——portal 引用（对象方法名不提升——TS 报错）——
   *  接口 panelRef 方法转发） */
  const panelRefImpl = (el: HTMLElement | null): void => {
    panel.current = el
    if (el && open.open) {
      // 定位（rAF 优先——帧边界后布局就绪——top/left 尺寸正确）——
      // **positioning 'none' 也 refresh**（真实 bug：Tour 自定位
      // （highlight/bubble fixed 视口坐标）依赖 position 回调更新目标
      // rect——panel 挂载不 refresh → rect 恒 0 → 气泡定位视口左上角）
      if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(refresh)
      else queueMicrotask(refresh)
    }
    // presence：监听退场动画结束（exit → closed）
    if (el && opts.presence) {
      const onAnimEnd = (e: AnimationEvent): void => {
        // **真实 bug**：Modal/Drawer 退场动画名是 unpop/fadeout——
        // 检查 includes('exit') 不匹配——animationend 被忽略——phase
        // 卡 exit 永不 closed（Escape 关闭后弹层残留）——exit 阶段任意
        // animationend 即退场完成（enter 动画在 open 阶段——忽略）
        if (phaseState.phase === 'exit') {
          phaseState.phase = 'closed'
          env.requestRender()
        }
      }
      el.addEventListener('animationend', onAnimEnd)
      env.onUnmount(() => el.removeEventListener('animationend', onAnimEnd))
    }
  }

  /** presence 状态机（会话级模态：open→exit→closed——退场动画） */
  const phaseIdx = env.nextHookIndex()
  const phaseState = env.getHookState<{ phase: PopupPhase; exitDone: boolean }>(phaseIdx) ?? { phase: 'closed', exitDone: false }
  env.setHookState(phaseIdx, phaseState)
  /** 渲染期 open 变化检测（prev 记忆——portal/sync 共用） */
  const openIdx = env.nextHookIndex()
  const prev = env.getHookState<{ open: boolean }>(openIdx) ?? { open: false }
  env.setHookState(openIdx, prev)


  /** Escape 关闭（常驻——open 时生效——closeOnEscape 显式 false 禁用——
   *  组件自控（Modal 危险操作差异留组件层）） */
  useGlobalKey(env, 'Escape', () => {
    if (open.open && (opts.closeOnEscape ?? true)) open.setOpen(false)
  })

  /** 外部点击关闭（常驻监听——open 时生效——el/panel 外关闭——
   *  closeOnOutside 显式 false 禁用（Confirm 默认 false 防误触——组件自控）） */
  const bodyPrevOverflowRef = useStableRef(env, '') as StableRef<string>
  const trapPrevFocusRef = useStableRef(env, null) as StableRef<HTMLElement | null>
  const lockEngagedRef = useStableRef(env, false) as StableRef<boolean>
  /** 会话级模态清理（滚动锁恢复 + 焦点归还——关闭/退场结束） */
  const restoreModalLock = (): void => {
    if (lockEngagedRef.current) {
      // 无条件恢复（旧值为空串也赋值——body overflow 空串 = 不锁定）
      if (win?.document?.body) win.document.body.style.overflow = bodyPrevOverflowRef.current
      bodyPrevOverflowRef.current = ''
      if (trapPrevFocusRef.current) {
        trapPrevFocusRef.current.focus?.()
        trapPrevFocusRef.current = null
      }
      lockEngagedRef.current = false
    }
  }

  /** Tab 焦点陷阱（trapFocus——面板内循环） */
  const trapKeyIdx = env.nextHookIndex()
  const trapState = env.getHookState<{ fn: ((e: KeyboardEvent) => void) | null }>(trapKeyIdx) ?? { fn: null }
  if (!trapState.fn && win) {
    const onTrapKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !opts.trapFocus || !open.open || !panel.current) return
      const focusables = Array.from(panel.current.querySelectorAll?.('input, button, [tabindex], select, textarea') ?? [])
        .filter((el) => !(el as HTMLButtonElement).disabled && (el as HTMLElement).offsetParent !== null) as HTMLElement[]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = win?.document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === panel.current || !panel.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    win.addEventListener('keydown', onTrapKey)
    env.onUnmount(() => win.removeEventListener('keydown', onTrapKey))
    trapState.fn = onTrapKey
  }
  env.setHookState(trapKeyIdx, trapState)

  /** 会话级模态接线（打开——trapFocus/lockScroll） */
  const engageModalLock = (): void => {
    lockEngagedRef.current = true
    if (opts.lockScroll && win?.document?.body) {
      bodyPrevOverflowRef.current = win.document.body.style.overflow
      win.document.body.style.overflow = 'hidden'
    }
    if (opts.trapFocus && win) {
      trapPrevFocusRef.current = win.document.activeElement as HTMLElement | null
      win.setTimeout(() => {
        const el = panel.current
        if (el) {
          const f = el.querySelector?.('input, button, [tabindex], select, textarea') as HTMLElement | null
          ;(f ?? el).focus?.()
        }
      }, 0)
    }
  }

  const downIdx = env.nextHookIndex()
  const downState = env.getHookState<{ fn: ((e: MouseEvent) => void) | null }>(downIdx) ?? { fn: null }
  if (!downState.fn && win) {
    const onDown = (e: MouseEvent): void => {
      if (!open.open || !(opts.closeOnOutside ?? true)) return
      const t = e.target as Node | null
      const el = resolveTrigger(opts)
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
      // **渲染期 open 变化检测**（portal 每次渲染调用——phase 同步——
      // presence 状态机驱动）
      if (prev.open !== open.open) {
        prev.open = open.open
        if (open.open) {
          phaseState.phase = 'open'
          phaseState.exitDone = false
          if (opts.positioning !== 'none') queueMicrotask(refresh)
          // **会话级模态接线（真实缺口）**：trapFocus 焦点陷阱 + lockScroll
          // 滚动锁——打开时生效（Modal/Img 依赖——之前接口声明未实现——
          // Modal 传 trapFocus/lockScroll 但无焦点 trap/滚动锁）
          // **会话级模态接线（真实缺口）**：trapFocus 焦点陷阱 + lockScroll
          // 滚动锁——打开时生效（Modal/Img 依赖——之前接口声明未实现）
          if (opts.trapFocus || opts.lockScroll) engageModalLock()
        } else if (opts.presence) {
          phaseState.phase = 'exit' // 退场——动画后 closed（panelRef 监听 animationend）
          // **无动画环境立即 closed**（jsdom/无 CSS 动画环境 animationend 不触发——
          // 不挂死）——**根+子元素检查**（真实 bug：Modal/Drawer 动画在子元素
          // （overlay/content）——只查根（none）误判无动画——退场截断）
          if (panel.current && win && !hasAnim(panel.current, win)) phaseState.phase = 'closed'
        } else {
          // 关闭（非 presence）：恢复滚动锁 + 归还焦点
          restoreModalLock()
        }
      }
      // presence：exit 阶段仍渲染（退场动画）——closed 后移除
      const show = opts.presence ? phaseState.phase !== 'closed' : open.open
      if (!show) {
        // 退场结束（closed）——恢复滚动锁 + 归还焦点
        if (opts.presence && phaseState.phase === 'closed') restoreModalLock()
        return null
      }
      // **mask 遮罩（真实缺口）**：mask/maskCentered/maskClosable——
      // 全屏遮罩 + 居中（Img 预览依赖——接口声明未实现——Img 传 mask:true
      // 但遮罩从未渲染）——遮罩 + 内容并排（flex 居中）
      let panelVn = content as VNode
      if (opts.mask) {
        const props0 = (panelVn.props ?? {}) as Record<string, any>
        const maskEl = h('div', {
          class: 'wf-popup-mask',
          style: {
            position: 'fixed', inset: '0', background: 'var(--wf-overlay, rgba(0,0,0,0.5))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 'var(--wf-z-modal, 1000)',
          },
          onClick: (e: Event) => {
            // 遮罩点击关闭（maskClosable 默认 true——危险操作显式 false 防误触）
            if (opts.maskClosable !== false && e.target === e.currentTarget) {
              open.setOpen(false)
              env.requestRender()
            }
          },
        },
          opts.maskCentered
            ? { ...panelVn, props: { ...props0 } }
            : h('div', { class: 'wf-popup-mask-inner' }, panelVn),
        )
        panelVn = maskEl
      }
      // **panelRef 接线 + 定位包装**（真实 bug：ui-dom 的 portal 注入
      // ref/class/style——vdom 原样 content——panelRef 从未被调用——退场
      // 监听/无动画检查全部失效（panel.current 恒 null）——Escape/关闭后
      // phase 卡 exit 永不 closed——弹层残留 DOM）
      const pv = panelVn as VNode
      const props = (pv.props ?? {}) as Record<string, any>
      const cls = opts.positioning === 'none'
        ? (props.class ?? '')
        : ['wf-popup', props.class].filter(Boolean).join(' ')
      const style = opts.positioning === 'none'
        ? { ...(props.style ?? {}), position: 'fixed' }
        : {
            ...(props.style ?? {}),
            position: 'fixed',
            top: `${pos.current.top}px`,
            left: `${pos.current.left}px`,
          }
      const panelFinal = { ...pv, props: { ...props, class: cls, style, ref: panelRefImpl } } as VNode
      return createPortal(panelFinal, key ?? 'popup')
    },
    get pos() {
      return pos.current
    },
    refresh,
    panelRef: panelRefImpl,
    get phase() {
      return phaseState.phase
    },
    sync(openNow: boolean): PopupPhase {
      // 渲染期同步（组件显式驱动——与 portal 内检测同逻辑——双保险）
      if (prev.open !== openNow) {
        prev.open = openNow
        if (openNow) {
          phaseState.phase = 'open'
          phaseState.exitDone = false
        } else if (opts.presence) {
          phaseState.phase = 'exit'
          if (panel.current && win && !hasAnim(panel.current, win)) phaseState.phase = 'closed'
        }
      }
      return phaseState.phase
    },
    // **wrapProps trigger 交互（真实 bug——Popover hover 失效）**：
    // Popover/ContextMenu 等依赖 wrapProps 的 trigger 行为（不自管触发）——
    // onClick 切换（受控转发 setOpen——onOpenChange）；**trigger:'hover' →
    // mouseenter/mouseleave 延迟驱动**；**trigger:'longpress' → contextmenu
    // （右键）**——组件自管触发的（TreeSelect 等不 spread）——**getter 渲染期
    // 解析**（isHoverTrigger 曾 mount 一次计算——`opts.trigger === 'hover'`
    // 只比较字符串——组件传函数（`trigger: () => latestTrigger`——Popover
    // hover 变体）→ 恒 false → hover 事件不绑定——函数形式全失效——
    // getter 每次渲染读最新 trigger——所有函数 trigger 组件受益
    get wrapProps() {
      const trig = typeof opts.trigger === 'function' ? opts.trigger() : opts.trigger
      const isHover = trig === 'hover'
      return {
        onClick: (e: Event) => { e.stopPropagation?.(); open.setOpen(!open.open) },
        ...(isHover
          ? {
              onMouseEnter: () => { hoverOpen() },
              onMouseLeave: () => { hoverClose() },
            }
          : {}),
        ...(trig === 'longpress'
          ? {
              onContextMenu: (e: MouseEvent) => {
                e.preventDefault()
                opts.onTrigger?.(e)
                open.setOpen(!open.open)
              },
            }
          : {}),
      }
    },
    onTrigger: () => {},
  }
}

/** usePopupPosition 选项（弹层/吸顶定位跟踪） */
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
  const pos = { top: 0, left: 0, refresh: () => {} }

  const refresh = (): void => {
    const el = options.el()
    if (!el) return
    const r = el.getBoundingClientRect()
    // 0 rect 防护：元素替换中/未布局/隐藏时 rect 全 0——跳过刷新（保留上一坐标）
    if (r.width === 0 && r.height === 0) return
    const p = options.compute(r)
    pos.top = p.top
    pos.left = p.left
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
