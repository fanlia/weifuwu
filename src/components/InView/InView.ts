/**
 * weifuwu/components — InView
 *
 * 进入视窗组件。通过 IntersectionObserver 监听元素是否进入视窗，
 * 实现内容懒加载：只有用户滚动到该区域时才渲染 children。
 *
 * 用法：
 *   <InView>
 *     <ExpensiveComponent />
 *   </InView>
 *
 *   <InView once={false} rootMargin="200px">
 *     <img src="large.jpg" />
 *   </InView>
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface InViewProps {
  /** 是否只触发一次（默认 true，进入后一直显示） */
  once?: boolean
  /** IntersectionObserver threshold（默认 0） */
  threshold?: number
  /** IntersectionObserver rootMargin（默认 '0px'） */
  rootMargin?: string
  /** 进入视窗前渲染的占位内容（默认轻量占位块） */
  placeholder?: any
  /** 进入视窗回调 */
  onEnter?: () => void
  /** 懒加载内容 */
  children?: any
}

export const InView: Component<InViewProps> = (props, ctx) => {
  const {
    once = true,
    threshold = 0,
    rootMargin = '0px',
    placeholder,
    onEnter,
    children,
  } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.inView = false }

  // ref 管理 IntersectionObserver
  const sentinelRef = (el: HTMLElement | null) => {
    if (!el) return
    if ($.inView && once) return // 已进入且 once=true，无需再观察

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          $.inView = true
          onEnter?.()
          if (once) io.disconnect()
        } else if (!once) {
          // once=false 时，离开视窗重置
          $.inView = false
        }
      },
      { threshold, rootMargin },
    )
    io.observe(el)

    return () => { io.disconnect() }
  }

  // 已经进入视窗 → 渲染真正内容
  if ($.inView) {
    return h('div', { class: 'wf-inview wf-inview--loaded' }, children)
  }

  // 尚未进入 → 渲染占位 sentinel
  const placeholderEl = placeholder !== undefined
    ? placeholder
    : h('div', { class: 'wf-inview-placeholder' })

  return h('div', {
    class: 'wf-inview wf-inview--pending',
    ref: sentinelRef,
  }, placeholderEl)
}
