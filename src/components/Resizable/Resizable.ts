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

/** 可拖拽分割面板（对应 shadcn Resizable）：两面板 + 拖拽手柄（pointer + 键盘方向键）。
 * 拖拽经 ctx.ui.useDrag（pointerdown 捕获 → window move delta / up 释放），不再自建 window 监听。
 * 最新 props 经 propsRef 供 mount 期 useDrag 回调读取。 */
export const Resizable: Component<ResizableProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let size = 0
  const propsRef: any = { ..._init }

  const clamp = (v: number) => Math.max(propsRef.min ?? 80, Math.min(v, propsRef.max ?? 600))
  const setSize = (v: number) => {
    const next = clamp(v)
    if (next !== size) {
      size = next
      propsRef.onResize?.(next)
      ctx.ui.render()
    }
  }

  // 拖拽原语：onStart 记录起始尺寸，onMove 按方向取 delta
  let startSize = 0
  const drag = ctx.ui.useDrag({
    onStart: () => { startSize = size },
    onMove: (e, d) => {
      const delta = propsRef.direction === 'horizontal' ? d.x : d.y
      setSize(startSize + delta)
    },
  })

  return (props) => {
    Object.assign(propsRef, props)
    const {
      direction = 'horizontal', defaultSize = 300, min = 80, max = 600,
      step = 20, children, onResize, className,
    } = props
    void min; void max; void onResize

    if (size === 0) size = defaultSize

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
      ...drag, // onPointerDown（useDrag：捕获 + window move/up + preventDefault）
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
