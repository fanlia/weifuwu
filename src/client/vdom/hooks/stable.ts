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

/** 响应式系统偏好（prefers-reduced-motion）。mount 期一次判定 */
/** matchMedia 解析（browser 注入优先——全局兜底（jsdom/测试 mock 通道——
 *  设计规则 §5.5 生产走注入——兜底仅测试/无注入环境） */
function resolveMatchMedia(env: HookEnv): ((q: string) => MediaQueryList) | null {
  const win = env.getBrowser()?.window
  if (win?.matchMedia) return win.matchMedia.bind(win)
  // 全局兜底（jsdom 测试 mock——组件测试广泛用 globalThis.matchMedia）
  if (typeof matchMedia === 'function') return matchMedia.bind(undefined)
  return null
}

export function useReducedMotion(env: HookEnv): boolean {
  const mm = resolveMatchMedia(env)
  return !!(mm && mm('(prefers-reduced-motion: reduce)').matches)
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
  const easeFn = opts?.ease === 'linear'
    ? (p: number) => p
    : (p: number) => 1 - Math.pow(1 - p, 3) // easeOutCubic
  let rafId: number | undefined
  let currentTarget = target
  const handle: { value: number; reset: (to: number) => void } = {
    value: reduced ? target : 0,
    reset: () => {},
  }
  const rerender = (): void => { env.requestRender() }

  const tweenTo = (to: number): void => {
    currentTarget = to
    if (reduced) { handle.value = to; rerender(); return }
    if (to === handle.value) return // 同值不启动
    if (!win) { handle.value = to; return } // 无浏览器环境（SSR/测试）——直落
    if (rafId) win.cancelAnimationFrame(rafId)
    const from = handle.value
    const t0 = win.performance.now()
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / duration)
      handle.value = Math.round(from + (to - from) * easeFn(p))
      if (p < 1) {
        rafId = win.requestAnimationFrame(step)
      } else {
        rafId = undefined
      }
      rerender()
    }
    rafId = win.requestAnimationFrame(step)
  }

  handle.reset = (to: number): void => {
    if (to === currentTarget && rafId) return
    tweenTo(to)
  }

  // 组件卸载时取消 rAF（否则动画持续回调 rerender → 渲染已卸载组件——泄漏）
  env.onUnmount(() => {
    if (rafId && win) { win.cancelAnimationFrame(rafId); rafId = undefined }
  })

  handle.reset(target)
  return handle
}

export interface DragOptions {
  onStart?: (e: PointerEvent) => void
  onMove: (e: PointerEvent, delta: { x: number; y: number }) => void
  onEnd?: (e: PointerEvent) => void
}

/** 指针拖拽：pointerdown 捕获 → window move/up 活动期监听（卸载释放） */
export function useDrag(env: HookEnv, options: DragOptions) {
  const win = env.getBrowser()?.window
  let startX = 0
  let startY = 0
  let active = false
  const onPointerMove = (e: PointerEvent): void => {
    if (!active) return
    options.onMove(e, { x: e.clientX - startX, y: e.clientY - startY })
  }
  const onPointerUp = (e: PointerEvent): void => {
    if (!active) return
    active = false
    if (win) {
      win.removeEventListener('pointermove', onPointerMove as EventListener)
      win.removeEventListener('pointerup', onPointerUp as EventListener)
    }
    options.onEnd?.(e)
  }
  const onPointerDown = (e: PointerEvent): void => {
    if (active) return
    e.preventDefault() // 防拖拽期间文本选中
    active = true
    startX = e.clientX
    startY = e.clientY
    // 活动期注册 window 监听（捕获——拖出元素仍跟踪；onEnd 释放）
    if (win) {
      win.addEventListener('pointermove', onPointerMove as EventListener)
      win.addEventListener('pointerup', onPointerUp as EventListener)
    }
    options.onStart?.(e)
  }

  // 组件卸载时释放活动期监听（拖拽中卸载：pointermove/pointerup 残留 window——泄漏）
  env.onUnmount(() => {
    if (active && win) {
      win.removeEventListener('pointermove', onPointerMove as EventListener)
      win.removeEventListener('pointerup', onPointerUp as EventListener)
      active = false
    }
  })

  return { onPointerDown }
}

/** 可视视口（visualViewport）状态 */
export interface VisualViewportHandle {
  height: number
  offsetTop: number
  keyboardOpen: boolean
}

/** 可视视口跟踪：键盘弹起/缩放时自动更新 + 重渲染（vv 不可用 → window resize fallback） */
export function useVisualViewport(env: HookEnv): VisualViewportHandle {
  const win = env.getBrowser()?.window
  const vv0 = win?.visualViewport
  const handle: VisualViewportHandle = {
    // 初始即 vv 值（对齐 ui-dom——首次渲染读 vv 而非 innerHeight）
    height: vv0?.height ?? win?.innerHeight ?? 0,
    offsetTop: vv0?.offsetTop ?? 0,
    keyboardOpen: false,
  }
  const update = (): void => {
    const vv = win?.visualViewport
    handle.height = vv?.height ?? win?.innerHeight ?? 0
    handle.offsetTop = vv?.offsetTop ?? 0
    handle.keyboardOpen = handle.height < (win?.innerHeight ?? 0) * 0.9
    env.requestRender()
  }
  if (win) {
    const vv = win.visualViewport
    if (vv?.addEventListener) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      env.onUnmount(() => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      })
    } else {
      win.addEventListener('resize', update)
      env.onUnmount(() => win.removeEventListener('resize', update))
    }
  }
  return handle
}
