import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface ResizableProps {
  /** horizontal 左右分割（默认）/ vertical 上下分割 */
  direction?: 'horizontal' | 'vertical'
  /** 第一面板初始尺寸（px） */
  defaultSize?: number
  /** 最小尺寸（px），默认 80 */
  min?: number
  /** 最大尺寸（px），默认 80% 视口 */
  max?: number
  /** 键盘步进（px），默认 20 */
  step?: number
  children: [any, any]
  onResize?: (size: number) => void
  className?: string
}

/** 可拖拽分割面板（对应 shadcn Resizable）：两面板 + 拖拽手柄（pointer + 键盘方向键）。 */
export const Resizable: Component<ResizableProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let size = 0

  return (props) => {
    const {
      direction = 'horizontal', defaultSize = 300, min = 80, max = 600,
      step = 20, children, onResize, className,
    } = props

    if (size === 0) size = defaultSize

    const clamp = (v: number) => Math.max(min, Math.min(v, max))

    const setSize = (v: number) => {
      const next = clamp(v)
      if (next !== size) {
        size = next
        onResize?.(next)
        ctx.ui.render()
      }
    }

    const onPointerDown = (e: any) => {
      e.preventDefault()
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = size
      const onMove = (ev: any) => {
        const delta = (direction === 'horizontal' ? ev.clientX : ev.clientY) - startPos
        setSize(startSize + delta)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    const onKeyDown = (e: any) => {
      const inc = direction === 'horizontal'
        ? (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)
        : (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)
      if (inc !== 0) {
        e.preventDefault()
        setSize(size + inc)
      }
    }

    const handle = h('div', {
      class: 'wf-resizable-handle',
      role: 'separator',
      'aria-orientation': direction === 'horizontal' ? 'vertical' : 'horizontal',
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    })

    return h('div', {
      class: ['wf-resizable', `wf-resizable--${direction}`, className].filter(Boolean).join(' '),
    }, [
      h('div', { class: 'wf-resizable-panel', style: { flexBasis: `${size}px` } }, children[0]),
      handle,
      h('div', { class: 'wf-resizable-panel wf-resizable-panel--fill' }, children[1]),
    ])
  }
}
