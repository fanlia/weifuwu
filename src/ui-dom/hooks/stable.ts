/**
 * hooks/stable — 基础/稳定 hooks（无共享全局状态依赖）
 *
 * useStableRef / useHoverCapable / useReducedMotion / useAnimationEnd /
 * useLongPress / usePresence / useTween
 */

import type { HookEnv } from './types.ts'
import type {
  UseLongPressOptions,
  UseLongPressHandle,
} from '../types.ts'

/** 稳定 ref 引用：mount 作用域持有，跨渲染引用恒等（内联 ref 陷阱根治） */
export function useStableRef(
  _env: HookEnv,
  init: (el: HTMLElement | null) => void,
  cleanup?: () => void,
): (el: HTMLElement | null) => void {
  const ref = (el: HTMLElement | null) => {
    if (el) init(el)
    else cleanup?.()
  }
  return ref
}

/** 当前设备是否支持 hover（matchMedia '(hover: hover)'，mount 期一次判定） */
export function useHoverCapable(env: HookEnv): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches
}

/** 响应式系统偏好（prefers-reduced-motion）。mount 期一次判定 */
export function useReducedMotion(_env: HookEnv): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** 元素动画完成回调（animationend）：stableRef——ref 挂载绑定、卸载清理、引用恒定 */
export function useAnimationEnd(env: HookEnv, cb: () => void, opts?: { once?: boolean }) {
  void env
  let el: HTMLElement | null = null
  const handler = () => {
    cb()
    if (opts?.once && el) el.removeEventListener('animationend', handler)
  }
  const ref = (node: HTMLElement | null) => {
    if (node) {
      el = node
      node.addEventListener('animationend', handler)
    } else if (el) {
      el.removeEventListener('animationend', handler)
      el = null
    }
  }
  return ref
}

/** 长按手势：pointerdown 按住 duration 触发，提前松开/位移取消，桌面右键兼容 */
export function useLongPress(env: HookEnv, options: UseLongPressOptions): UseLongPressHandle {
  const { onLongPress, duration = 500 } = options
  let timer: ReturnType<typeof setTimeout> | undefined
  let startX = 0
  let startY = 0
  let startEvent: PointerEvent | null = null
  const clear = () => { clearTimeout(timer); timer = undefined }
  // 组件卸载时清除挂起定时器（长按中卸载：onLongPress 仍会触发——泄漏）
  const selfId = env.selfId()
  if (selfId) {
    const unsub = env.onUnmount((id) => { if (id === selfId) { clear(); unsub() } })
  }
  return {
    onPointerDown: (e: PointerEvent) => {
      startX = e.clientX ?? 0
      startY = e.clientY ?? 0
      startEvent = e
      clear()
      timer = setTimeout(() => { timer = undefined; if (startEvent) onLongPress(startEvent) }, duration)
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove: (e: PointerEvent) => {
      const dx = Math.abs((e.clientX ?? 0) - startX)
      const dy = Math.abs((e.clientY ?? 0) - startY)
      if (dx > 10 || dy > 10) clear()
    },
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); onLongPress(e) },
  }
}

/**
 * 通用显隐状态机：open → exit → closed（animationend 延迟卸载）。
 * usePopup presence 模式基于它——状态机单点实现。
 */
export function usePresence(env: HookEnv, options?: { name?: string }) {
  void options
  const selfId = env.selfId()
  let phase: 'closed' | 'open' | 'exit' = 'closed'
  let animEndHandler: (() => void) | undefined

  const finishExit = () => {
    phase = 'closed'
    if (selfId) env.render([selfId])
    else env.render()
  }

  const ref = (el: HTMLElement | null) => {
    if (el) {
      if (!animEndHandler) {
        animEndHandler = () => { if (phase === 'exit') finishExit() }
        el.addEventListener('animationend', animEndHandler)
      }
    } else {
      animEndHandler = undefined
    }
  }

  return {
    get phase() { return phase },
    ref,
    sync: (open: boolean) => {
      if (open) phase = 'open'
      else if (phase === 'open') phase = 'exit'
      return phase
    },
  }
}

/** 数值补间：rAF + ease + reduced-motion 直落终值。目标变化自动补间。 */
export function useTween(env: HookEnv, target: number, opts?: { duration?: number; ease?: 'linear' | 'easeOutCubic' }) {
  const selfId = env.selfId()
  const reduced = useReducedMotion(env)
  const duration = opts?.duration ?? 400
  const easeFn = opts?.ease === 'linear'
    ? (p: number) => p
    : (p: number) => 1 - Math.pow(1 - p, 3) // easeOutCubic
  let rafId: number | undefined
  let currentTarget = target
  const handle: { value: number; reset: (to: number) => void } = {
    value: reduced ? target : 0,
    reset: () => {},
  }
  // 每帧渲染（rAF 只更新闭包 value，不触发渲染则 DOM 冻结）
  const rerender = () => {
    if (selfId) env.render([selfId])
    else env.render()
  }

  const tweenTo = (to: number) => {
    currentTarget = to
    if (reduced) { handle.value = to; rerender(); return }
    if (to === handle.value) return // 同值不启动
    if (rafId) cancelAnimationFrame(rafId)
    const from = handle.value
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      handle.value = Math.round(from + (to - from) * easeFn(p))
      if (p < 1) {
        rafId = requestAnimationFrame(step)
        rerender()
      } else {
        rafId = undefined
        rerender()
      }
    }
    rafId = requestAnimationFrame(step)
  }

  handle.reset = (to: number) => {
    if (to === currentTarget && rafId) return
    tweenTo(to)
  }

  // 组件卸载时取消 rAF（否则动画持续回调 rerender → 渲染已卸载组件——泄漏）
  if (selfId) {
    const unsub = env.onUnmount((id) => {
      if (id !== selfId) return
      if (rafId) { cancelAnimationFrame(rafId); rafId = undefined }
      unsub()
    })
  }

  queueMicrotask(() => tweenTo(target))

  return handle
}
