/**
 * weifuwu/components — InView
 *
 * 组件挂载后用 ctx.ui.onmounted 获取根元素，设置 IntersectionObserver。
 * 进入视窗后替换占位符为真实内容。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface InViewProps {
  once?: boolean
  threshold?: number
  rootMargin?: string
  placeholder?: any
  onEnter?: () => void
  children?: any
}

export const InView: Component<InViewProps> = (_props, ctx) => {
  let inView = false
  let entered = false
  let io: IntersectionObserver | undefined

  const sentinelRef = (el: HTMLElement | null) => {
    if (el) {
      io = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          inView = true
          ctx.ui.render()
        }
      }, { threshold: _props.threshold ?? 0, rootMargin: _props.rootMargin ?? '0px' })
      io.observe(el)
    } else {
      io?.disconnect()
    }
  }

  return (props: InViewProps) => {
    if (inView) {
      if (!entered) {
        entered = true
        const once = props.once !== false
        if (once) io?.disconnect()
        props.onEnter?.()
      }
      return h('div', { class: 'wf-inview wf-inview--loaded' }, props.children)
    }

    const placeholderEl = props.placeholder !== undefined
      ? props.placeholder
      : h('div', { class: 'wf-inview-placeholder' })

    return h('div', {
      class: 'wf-inview wf-inview--pending',
    }, [
      h('div', {
        class: 'wf-inview-pending',
        style: { width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' },
        ref: sentinelRef,
      }),
      placeholderEl,
    ])
  }
}
