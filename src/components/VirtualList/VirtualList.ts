import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface VirtualListProps {
  items?: any[]
  /** 视口高度（px） */
  height?: number
  /** 固定 item 高度（px）——虚拟滚动的基础 */
  itemHeight?: number
  renderItem?: (item: any, index: number) => any
  /** 可见区外额外渲染数量 */
  overscan?: number
  keyBy?: (item: any, index: number) => string | number
  className?: string
}

/**
 * 虚拟列表（对应 EP VirtualTable）：固定高度 items 只渲染可见窗口，
 * spacer 撑总高 + 绝对定位可见项。1000+ 条列表性能关键。
 * 裁剪：动态高度（ResizeObserver 测量）、滚动平滑（sticky 场景）。
 * 滚动跟随：ctx.ui.useScrollPosition（内置全局 scroll 监听 + rAF 节流）——
 * 像素级 scrollTop 响应式，无组件自建 scroll 监听。
 */
export const VirtualList: Component<VirtualListProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let el: HTMLElement | null = null

  // 容器 scrollTop 响应式（capture 监听捕获子容器滚动，rAF 节流更新）
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => el ?? window })

  const stableRef = (node: HTMLElement | null) => {
    if (node) {
      el = node
      scroll.refresh()
    } else {
      el = null
    }
  }

  return (props) => {
    const {
      items = [], height = 400, itemHeight = 40, renderItem,
      overscan = 5, keyBy, className,
    } = props

    const total = items.length
    const start = Math.max(0, Math.floor(scroll.y / itemHeight) - overscan)
    const end = Math.min(total, Math.ceil((scroll.y + height) / itemHeight) + overscan)

    const spacer = h('div', {
      class: 'wf-virtual-list-spacer',
      style: { height: `${total * itemHeight}px` },
    })

    const visible: any[] = []
    for (let i = start; i < end; i++) {
      const item = items[i]
      visible.push(h('div', {
        class: 'wf-virtual-list-item',
        style: {
          position: 'absolute',
          top: `${i * itemHeight}px`,
          left: 0,
          right: 0,
          height: `${itemHeight}px`,
        },
        key: keyBy ? keyBy(item, i) : i,
      }, renderItem ? renderItem(item, i) : String(item)))
    }

    const list = h('div', { class: 'wf-virtual-list-window' }, visible)

    return h('div', {
      class: ['wf-virtual-list', className].filter(Boolean).join(' '),
      style: { height: `${height}px`, overflowY: 'auto' },
      ref: stableRef,
    }, [spacer, list])
  }
}
