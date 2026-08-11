/**
 * hooks/events — 事件/键盘/拖拽 hooks
 *
 * useGlobalKey / useDrag / useDragDrop
 */

import type { HookEnv } from './types.ts'

/** 全局键盘监听：window keydown，mount 注册 + 卸载清理。返回退订函数。 */
export function useGlobalKey(env: HookEnv, handler: (e: KeyboardEvent) => void): () => void {
  const selfId = env.selfId()
  const b = env.browser
  if (typeof window === 'undefined') return () => {}
  b.addEventListener('keydown', handler)
  if (selfId) {
    const unsub = env.onUnmount((id) => { if (id === selfId) { b.removeEventListener('keydown', handler); unsub() } })
  }
  return () => b.removeEventListener('keydown', handler)
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
  const onPointerUp = (e: PointerEvent) => {
    if (!active) return
    active = false
    b.removeEventListener('pointermove', onPointerMove)
    b.removeEventListener('pointerup', onPointerUp)
    options.onEnd?.(e)
  }
  const onPointerDown = (e: PointerEvent) => {
    if (active) return
    e.preventDefault() // 防拖拽期间文本选中
    active = true
    startX = e.clientX
    startY = e.clientY
    b.addEventListener('pointermove', onPointerMove)
    b.addEventListener('pointerup', onPointerUp)
    options.onStart?.(e)
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
