/**
 * hooks/events — 事件/键盘/拖拽 hooks
 *
 * useGlobalKey / useDrag / useDragDrop
 */

import type { HookEnv } from '../contracts/hooks.ts'
import { addGlobalListener } from '../services/global-events.ts'

/** 全局键盘监听：window keydown，mount 注册 + 卸载清理。返回退订函数。 */
export function useGlobalKey(env: HookEnv, handler: (e: KeyboardEvent) => void): () => void {
  const selfId = env.compId
  if (typeof window === 'undefined') return () => {}
  // 全局监听统一走事件代理（聚合注册/退订 + 事件流可观测）
  const off = addGlobalListener(window, 'keydown', handler as EventListener)
  if (selfId) {
    const unsub = env.onUnmount(() => { off(); unsub() })
  }
  return off
}

/** 指针拖拽：pointerdown 捕获 → window pointermove（delta）/pointerup（释放）。 */
export function useDrag(env: HookEnv, options: {
  onStart?: (e: PointerEvent) => void
  onMove: (e: PointerEvent, delta: { x: number; y: number }) => void
  onEnd?: (e: PointerEvent) => void
}) {
  const b = env.browser
  let startX = 0
  let startY = 0
  let active = false
  const onPointerMove = (e: PointerEvent) => {
    if (!active) return
    options.onMove(e, { x: e.clientX - startX, y: e.clientY - startY })
  }
  let moveOff: (() => void) | null = null
  let upOff: (() => void) | null = null
  const releasePointers = () => {
    moveOff?.(); moveOff = null
    upOff?.(); upOff = null
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!active) return
    active = false
    releasePointers()
    options.onEnd?.(e)
  }
  const onPointerDown = (e: PointerEvent) => {
    if (active) return
    e.preventDefault() // 防拖拽期间文本选中
    active = true
    startX = e.clientX
    startY = e.clientY
    // 全局监听统一走事件代理（活动期注册——onEnd/卸载释放）
    moveOff = addGlobalListener(window, 'pointermove', onPointerMove as EventListener)
    upOff = addGlobalListener(window, 'pointerup', onPointerUp as EventListener)
    options.onStart?.(e)
  }

  // 组件卸载时释放活动期监听（拖拽中卸载：pointermove/pointerup 残留 window——泄漏）
  const selfId = env.compId
  if (selfId) {
    const unsub = env.onUnmount(() => {
            if (active) {
        releasePointers()
        active = false
      }
      unsub()
    })
  }
  return { onPointerDown }
}

/** 原生 DnD：drop/dragover/dragleave（dragover 自动 preventDefault）。 */
export function useDragDrop(env: HookEnv, options: {
  onDrop?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragLeave?: (e: DragEvent) => void
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: (e: DragEvent) => void
}) {
  void env
  const dropProps: Record<string, any> = {}
  if (options.onDrop) {
    dropProps.onDrop = (e: DragEvent) => {
      e.preventDefault() // drop 默认行为是打开文件——必须阻止
      options.onDrop!(e)
    }
  }
  if (options.onDragOver) {
    dropProps.onDragOver = (e: DragEvent) => {
      e.preventDefault()
      options.onDragOver!(e)
    }
  }
  if (options.onDragLeave) dropProps.onDragLeave = (e: DragEvent) => options.onDragLeave!(e)

  // 拖拽源侧：draggable + onDragStart/onDragEnd
  const dragProps: Record<string, any> = { draggable: true }
  if (options.onDragStart) {
    const userStart = options.onDragStart
    dragProps.onDragStart = (e: DragEvent) => {
      if (typeof document !== 'undefined') document.body.classList.add('wf-dragging')
      userStart(e)
    }
  }
  if (options.onDragEnd) {
    const userEnd = options.onDragEnd
    dragProps.onDragEnd = (e: DragEvent) => {
      if (typeof document !== 'undefined') document.body.classList.remove('wf-dragging')
      userEnd(e)
    }
  }
  return { dropProps, dragProps }
}
