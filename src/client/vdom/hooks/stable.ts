/**
 * vdom hooks — stable（useTween/useDrag/useVisualViewport/useReducedMotion）
 *
 * P1 契约补齐（design/vdom-replace-plan.md §1.1）——组件库消费缺口：
 * - useTween（StatCard 数值动画——rAF + ease + reduced-motion 直落）
 * - useDrag（Resizable/ImageCropper——pointerdown 捕获拖拽）
 * - useVisualViewport（键盘弹起/缩放跟踪）
 * - useReducedMotion（偏好感知——JS 动画侧跳过）
 *
 * 语义对齐 ui-dom 原实现——实现走 vdom 架构（browser 注入——零全局
 * 直接访问；onUnmount 清理——rAF/监听/活动期指针不泄漏）。
 */

import type { HookEnv } from './env.ts'
import { useMedia } from './drag-media.ts'
import { create } from '../observable/index.ts'
import { useObservable } from './use-observable.ts'

/** 响应式系统偏好（prefers-reduced-motion）。mount 期一次判定 */

export function useReducedMotion(env: HookEnv): boolean {
  // 2027-08：组合 useMedia（媒体源缓存——统一订阅/退订/重渲染）
  return useMedia(env, '(prefers-reduced-motion: reduce)')()
}

export interface TweenOptions {
  duration?: number
  ease?: 'linear' | 'easeOutCubic'
}

/** 数值补间：rAF + ease + reduced-motion 直落终值。目标变化自动补间。 */
export function useTween(env: HookEnv, target: number, opts?: TweenOptions) {
  const win = env.getBrowser()?.window
  const reduced = useReducedMotion(env)
  const duration = opts?.duration ?? 400
  if (duration <= 0) {
    // **duration ≤ 0 防护（R5 实证——除零 NaN）**：直落终值（补间语义
    // 在无时长时不成立——跳过 rAF 循环）
    return { value: target, reset: () => {} }
  }
  const easeFn = opts?.ease === 'linear'
    ? (p: number) => p
    : (p: number) => 1 - Math.pow(1 - p, 3) // easeOutCubic

  // **槽位记忆化（G14——2026-XX 报表页实证）**：handle 是带动画状态
  // （value/rafId/currentTarget）的**可变状态机**——必须跨渲染持久。
  // 旧实现每次 renderFn 重跑都新建 handle（value=0）→ StatCard 的动画
  // 帧回调 rerender → 又新建 handle → 渲染读到的永远是新 handle 的
  // value=0 → 数字动画恒显示 0（同页 tokens 卡字符串直落路径正确——
  // 「Token 3.2k 正确 + Agent 总数恒 0」混合实证的实源）。
  // 修复：按调用顺序槽位（nextHookIndex/getHookState——与 useOpen/
  // useChat 同机制）——handle 只创建一次——动画状态跨渲染持久。
  const idx = env.nextHookIndex()
  let handle = env.getHookState<{ value: number; reset: (to: number) => void }>(idx)
  if (handle) {
    handle.reset(target)
    return handle
  }
  let value = reduced ? target : 0
  let rafId: number | undefined
  let currentTarget = target
  let animStartAt = 0
  // **rAF 停摆兜底（G14——报表页实证）**：headless / 后台 tab 中 rAF 不触发——
  // 动画 value 永远停在 from——渲染读 getter 时若「动画已启动但超过
  // duration + 200ms 未完成」直接返回终值（正确性优先于装饰动画）。
  const STALL_MS = duration + 200
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const h: { value: number; reset: (to: number) => void } = {
    get value(): number {
      // 读时兜底（渲染发生但动画帧未推进——后台 tab 节流场景）
      if (rafId !== undefined && win && win.performance.now() - animStartAt > STALL_MS) {
        return currentTarget
      }
      return value
    },
    set value(v: number) { value = v },
    reset: () => {},
  }
  const rerender = (): void => { env.requestRender() }

  const tweenTo = (to: number): void => {
    currentTarget = to
    if (reduced) { h.value = to; rerender(); return }
    if (to === h.value) return // 同值不启动
    if (!win) { h.value = to; return } // 无浏览器环境（SSR/测试）——直落
    if (rafId !== undefined) win.cancelAnimationFrame(rafId)
    const from = h.value
    const t0 = win.performance.now()
    animStartAt = t0
    armStallFallback()
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / duration)
      h.value = Math.round(from + (to - from) * easeFn(p))
      if (p < 1) {
        rafId = win.requestAnimationFrame(step)
      } else {
        rafId = undefined
      }
      rerender()
    }
    rafId = win.requestAnimationFrame(step)
  }

  // **主动兜底渲染（G14 定稿）**：headless / 后台 tab 中 rAF 完全停摆——
  // 动画帧回调（含 rerender）永不执行——DOM 永远停在起始值（报表页
  // 「Agent 总数恒 0」实证）。setTimeout 不受合成器可见性门控——超时后
  // 强制落终值 + 触发一次渲染（正确性优先于装饰动画——渲染健康纪律）。
  const armStallFallback = (): void => {
    if (!win) return
    if (stallTimer !== undefined) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      stallTimer = undefined
      if (rafId !== undefined) {
        if (win) win.cancelAnimationFrame(rafId)
        rafId = undefined
        h.value = currentTarget
        rerender()
      }
    }, STALL_MS)
  }

  h.reset = (to: number): void => {
    if (to === currentTarget && rafId !== undefined) return
    tweenTo(to)
  }

  // 组件卸载时取消 rAF（否则动画持续回调 rerender → 渲染已卸载组件——泄漏）
  env.onUnmount(() => {
    if (rafId !== undefined && win) { win.cancelAnimationFrame(rafId); rafId = undefined }
  })

  env.setHookState(idx, h)
  handle = h
  handle.reset(target)
  return handle
}

export interface DragOptions {
  onStart?: (e: PointerEvent) => void
  onMove: (e: PointerEvent, delta: { x: number; y: number }) => void
  onEnd?: (e: PointerEvent) => void
}

/** 指针拖拽：pointerdown 捕获 → window move/up/cancel 活动期监听（卸载释放） */
export function useDrag(env: HookEnv, options: DragOptions) {
  const win = env.getBrowser()?.window
  let startX = 0
  let startY = 0
  let active = false
  let activePointerId = 0
  const onPointerMove = (e: PointerEvent): void => {
    if (!active) return
    options.onMove(e, { x: e.clientX - startX, y: e.clientY - startY })
  }
  const onPointerUp = (e: PointerEvent): void => {
    if (!active) return
    // **pointerId 匹配（R5——多指竞态）**：只响应起始指（第二个手指的
    // move/up 不干扰——active 期间后续 pointerdown 已忽略——但 pointerup
    // 需按起始指判定结束）
    if (e.pointerId !== activePointerId) return
    active = false
    if (win) {
      win.removeEventListener('pointermove', onPointerMove as EventListener)
      win.removeEventListener('pointerup', onPointerUp as EventListener)
      win.removeEventListener('pointercancel', onPointerCancel as EventListener)
    }
    options.onEnd?.(e)
  }
  const onPointerCancel = (e: PointerEvent): void => {
    // **pointercancel（R5 实证——拖拽竞态缺口）**：触摸中断/系统手势
    // 抢占 → 无 pointerup——旧实现监听残留（active 永真——window 监听
    // 不释放——泄漏 + 后续 move 持续回调）——显式清理 + onEnd
    if (!active || e.pointerId !== activePointerId) return
    active = false
    if (win) {
      win.removeEventListener('pointermove', onPointerMove as EventListener)
      win.removeEventListener('pointerup', onPointerUp as EventListener)
      win.removeEventListener('pointercancel', onPointerCancel as EventListener)
    }
    options.onEnd?.(e)
  }
  const onPointerDown = (e: PointerEvent): void => {
    if (active) return
    e.preventDefault() // 防拖拽期间文本选中
    active = true
    activePointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    // 活动期注册 window 监听（捕获——拖出元素仍跟踪；onEnd 释放）
    if (win) {
      win.addEventListener('pointermove', onPointerMove as EventListener)
      win.addEventListener('pointerup', onPointerUp as EventListener)
      win.addEventListener('pointercancel', onPointerCancel as EventListener)
    }
    options.onStart?.(e)
  }

  // 组件卸载时释放活动期监听（拖拽中卸载：pointermove/pointerup 残留 window——泄漏）
  env.onUnmount(() => {
    if (active && win) {
      win.removeEventListener('pointermove', onPointerMove as EventListener)
      win.removeEventListener('pointerup', onPointerUp as EventListener)
      win.removeEventListener('pointercancel', onPointerCancel as EventListener)
      active = false
    }
  })

  return { onPointerDown }
}

/** 可视视口（visualViewport）状态 */
/** 可视视口 handle（**对象 getter 形态**——读时求值——mount 闭包持有
 *  永远最新——位置规则在 API 形状不存在） */
export interface VisualViewportHandle {
  readonly height: number
  readonly offsetTop: number
  readonly keyboardOpen: boolean
}

/** 可视视口跟踪：键盘弹起/缩放时自动更新 + 重渲染（vv 不可用 → window resize fallback） */
/** 可视视口跟踪（键盘弹起/缩放——vv 不可用 → window resize fallback）
 *  2027-08 迁移（波次 3）：实现 = useObservable(vv 源)——订阅/退订/重渲染
 *  统一——形状保留（对象 getter——调用方零改动） */
export function useVisualViewport(env: HookEnv): VisualViewportHandle {
  const state = useObservable(env, visualViewport$(env), { height: 0, offsetTop: 0, keyboardOpen: false })
  return {
    get height() { return state().height },
    get offsetTop() { return state().offsetTop },
    get keyboardOpen() { return state().keyboardOpen },
  } as VisualViewportHandle
}

/** vv 源（vv resize/scroll → 状态——vv 不可用 → window resize fallback——
 *  防御保留：height < innerHeight*0.9 → keyboardOpen） */
function visualViewport$(env: HookEnv): import('../observable/index.ts').Observable<{ height: number; offsetTop: number; keyboardOpen: boolean }> {
  const win = env.getBrowser()?.window
  return create<{ height: number; offsetTop: number; keyboardOpen: boolean }>((obs) => {
    const read = (): { height: number; offsetTop: number; keyboardOpen: boolean } => {
      const vv = win?.visualViewport
      const height = vv?.height ?? win?.innerHeight ?? 0
      return { height, offsetTop: vv?.offsetTop ?? 0, keyboardOpen: height < (win?.innerHeight ?? 0) * 0.9 }
    }
    if (!win) { obs.next({ height: 0, offsetTop: 0, keyboardOpen: false }); obs.complete(); return () => {} }
    const emit = (): void => obs.next(read())
    const vv = win.visualViewport
    if (vv?.addEventListener) {
      vv.addEventListener('resize', emit)
      vv.addEventListener('scroll', emit)
      emit()
      return () => {
        vv.removeEventListener('resize', emit)
        vv.removeEventListener('scroll', emit)
      }
    }
    win.addEventListener('resize', emit)
    emit()
    return () => win.removeEventListener('resize', emit)
  })
}
