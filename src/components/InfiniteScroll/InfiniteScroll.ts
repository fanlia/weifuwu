import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface InfiniteScrollProps {
  hasMore?: boolean
  loading?: boolean
  /** 触底加载回调（sentinel 进入视口触发） */
  onLoadMore?: () => void
  /** 提前触发距离（px） */
  threshold?: number
  children?: any
  loadMoreText?: string
  endText?: string
  className?: string
}

/** 无限滚动（对应 EP InfiniteScroll）：底部哨兵进入视口 → 加载更多。 */
export const InfiniteScroll: Component<InfiniteScrollProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let io: IntersectionObserver | undefined

  const propsRef: any = {}

  const sentinelRef = (el: HTMLElement | null) => {
    if (el) {
      io = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          if (propsRef.hasMore !== false && !propsRef.loading) {
            propsRef.onLoadMore?.()
          }
        }
      }, { rootMargin: `0px 0px ${propsRef.threshold ?? 100}px 0px` })
      io.observe(el)
    } else {
      io?.disconnect()
      io = undefined
    }
  }

  return (props) => {
    Object.assign(propsRef, props)
    const {
      hasMore = true, loading, onLoadMore, threshold = 100,
      children, loadMoreText = '加载中...', endText = '没有更多了', className,
    } = props

    let footer: any = null
    if (loading) {
      footer = h('div', { class: 'wf-infinite-scroll-loading' }, loadMoreText)
    } else if (hasMore === false) {
      footer = h('div', { class: 'wf-infinite-scroll-end' }, endText)
    } else {
      footer = h('div', { class: 'wf-infinite-scroll-sentinel', ref: sentinelRef })
    }

    return h('div', {
      class: ['wf-infinite-scroll', className].filter(Boolean).join(' '),
    }, [
      children,
      footer,
    ])
  }
}
