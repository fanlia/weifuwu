import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

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
  /** 空数据占位（F2 状态矩阵——容器类基线） */
  emptyText?: string
  className?: string
}

/**
 * 虚拟列表（对应 EP VirtualTable）：固定高度 items 只渲染可见窗口，
 * spacer 撑总高 + 绝对定位可见项。1000+ 条列表性能关键。
 * 裁剪（CS-05，见 docs/client.md）：动态高度（ResizeObserver 测量）、滚动平滑（sticky 场景）。
 * 滚动跟随：ctx.ui.useScrollPosition（内置全局 scroll 监听 + rAF 节流）——
 * 像素级 scrollTop 响应式，无组件自建 scroll 监听。
 */
export const VirtualList: Component<VirtualListProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let el: HTMLElement | null = null

  // 容器 scrollTop 响应式（capture 监听捕获子容器滚动，rAF 节流更新）
  // **el ?? window fallback 真实 bug**：el 未挂载时 fallback window——
  // useScrollPosition 认为目标有效（注册到 window——容器滚动不冒泡——
  // 永不触发）且不重试——虚拟列表滚动失效（首项永不更新）——
  // 改为 null（未挂载 → 微任务重试 → 挂载后注册容器）
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => el ?? null })

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
      overscan = 5, keyBy, emptyText = '暂无数据', className,
    } = props

    // 浏览器刷新/前进后退恢复滚动位置（直接设 scrollTop，无 scroll 事件）→ 主动同步
    // （**getter 形态（2026-08）**：y 只读——hook 提供标准同步入口 refresh()
    // ——手动重算读当前滚动位置——组件不写 hook 状态）
    if (el && el.scrollTop !== scroll.y) {
      scroll.refresh()
    }

    const total = items.length
    const start = Math.max(0, Math.floor(scroll.y / itemHeight) - overscan)
    const end = Math.min(total, Math.ceil((scroll.y + height) / itemHeight) + overscan)

    if (total === 0) {
      return h('div', {
        class: ['wf-virtual-list', 'wf-virtual-list--empty', className].filter(Boolean).join(' '),
        style: { height: `${height}px` },
      }, emptyText)
    }

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
      // 容器关键定位/宽度内联：item 绝对定位依赖 relative；width:100% 防 flex 子项
      // flex-basis:auto 取内容宽（absolute 内容不提供宽度 → 容器宽 0 → 文本被压缩）
      style: { position: 'relative', width: '100%', height: `${height}px`, overflowY: 'auto' },
      ref: stableRef,
    }, [spacer, list])
  }
}
