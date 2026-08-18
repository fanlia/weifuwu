/**
 * weifuwu/components — InView
 *
 * 进入视窗后替换占位符为真实内容。
 * 实现：ctx.ui.useInView（IO 封装）——滚动/尺寸变化由合成器线程评估，无 scroll 监听。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface InViewProps {
  once?: boolean
  threshold?: number
  rootMargin?: string
  placeholder?: any
  onEnter?: () => void
  children?: any
}

export const InView: Component<InViewProps> = async (_props, ctx) => {
  // ── mount（只一次）──
  let entered = false

  // render 阶段 props 经闭包变量传递（useInView 的 rootMargin/threshold 支持函数）
  const propsRef: any = { once: true }

  const inViewHandle = ctx.ui.useInView({
    rootMargin: () => propsRef.rootMargin ?? '0px',
    threshold: () => propsRef.threshold ?? 0,
  })

  const sentinelRef = (el: HTMLElement | null) => {
    if (el) inViewHandle.observe(el)
    else inViewHandle.disconnect()
  }

  return async (props: InViewProps) => {
    Object.assign(propsRef, props)

    if (inViewHandle.isIn) {
      if (!entered) {
        entered = true
        if (props.once !== false) inViewHandle.disconnect()
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
