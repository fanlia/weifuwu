/**
 * weifuwu/components — InView
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
  // ── mount（只一次）──
  const $ = ctx.ui.$
  $.inView = false

  // ── render（每次 dirty/props 变化）──
  return (props: InViewProps) => {
    const { once = true, threshold = 0, rootMargin = '0px', placeholder, onEnter, children } = props

    const sentinelRef = (el: HTMLElement | null) => {
      if (!el) return
      if ($.inView && once) return

      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            $.inView = true
            onEnter?.()
            if (once) io.disconnect()
          } else if (!once) {
            $.inView = false
          }
        },
        { threshold, rootMargin },
      )
      io.observe(el)
      return () => { io.disconnect() }
    }

    if ($.inView) {
      return h('div', { class: 'wf-inview wf-inview--loaded' }, children)
    }

    const placeholderEl = placeholder !== undefined
      ? placeholder
      : h('div', { class: 'wf-inview-placeholder' })

    return h('div', {
      class: 'wf-inview wf-inview--pending',
      ref: sentinelRef,
    }, placeholderEl)
  }
}
