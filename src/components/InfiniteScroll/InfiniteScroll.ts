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

/** 无限滚动（对应 EP InfiniteScroll）：底部哨兵进入视口 → 加载更多。
 * 实现：ctx.ui.useInView（IO 封装——合成器线程评估，替代组件自建 IntersectionObserver）。
 * onChange 在交叉状态变化时回调（IO 语义），与自建 IO 等价且不重复触发。 */
export const InfiniteScroll: Component<InfiniteScrollProps> = (_init, ctx) => {
  // ── mount（只一次）──
  const propsRef: any = {}
  const inView = ctx.ui.useInView({
    rootMargin: () => `0px 0px ${propsRef.threshold ?? 100}px 0px`,
    onChange: (_entry, isIn) => {
      if (isIn && propsRef.hasMore !== false && !propsRef.loading) {
        propsRef.onLoadMore?.()
      }
    },
  })

  return (props) => {
    Object.assign(propsRef, props)
    const {
      hasMore = true, loading, threshold = 100,
      children, loadMoreText = '加载中...', endText = '没有更多了', className,
    } = props
    void threshold // rootMargin 经 getter 动态读 propsRef

    let footer: any = null
    if (loading) {
      footer = h('div', { class: 'wf-infinite-scroll-loading' }, loadMoreText)
    } else if (hasMore === false) {
      footer = h('div', { class: 'wf-infinite-scroll-end' }, endText)
    } else {
      footer = h('div', {
        class: 'wf-infinite-scroll-sentinel',
        ref: inView.observe,
      })
    }

    return h('div', {
      class: ['wf-infinite-scroll', className].filter(Boolean).join(' '),
    }, [
      children,
      footer,
    ])
  }
}
