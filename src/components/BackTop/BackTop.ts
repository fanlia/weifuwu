import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface BackTopProps {
  /** 滚动超过此高度显示（px），默认 400 */
  visibilityHeight?: number
  /** 滚动容器（默认 window） */
  target?: () => HTMLElement | Window
  /** 平滑滚动，默认 true */
  smooth?: boolean
  'aria-label'?: string
  children?: any
  className?: string
}

/** 回到顶部（对应 EP Backtop / antd FloatButton.BackTop）：滚动超阈值显示，点击回顶
 * 实现：ctx.ui.useInView（IO 封装）观察文档顶部哨兵——rootMargin 顶部向外扩展
 * visibilityHeight，哨兵离开扩展区（= 滚动超阈值）→ 显示。无 scroll 监听、无警告。 */
export const BackTop: Component<BackTopProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let el: HTMLElement | null = null

  // 用 propsRef 读最新 props（事件回调里 props 是闭包捕获的旧值）
  const propsRef: any = {}

  // 哨兵 absolute top:0（无定位祖先时定位到文档顶部）；rootMargin 顶部向外扩展
  // visibilityHeight → 滚动超过阈值后哨兵离开扩展区 → isIn=false → 显示按钮
  const inView = ctx.ui.useInView({
    root: () => (propsRef.target ? propsRef.target() : null) as Element | null,
    rootMargin: () => `${propsRef.visibilityHeight ?? 400}px 0px 0px 0px`,
  })

  const sentinelRef = (node: HTMLElement | null) => {
    if (node) {
      el = node
      inView.observe(node)
    } else {
      el = null
      inView.disconnect()
    }
  }

  return (props) => {
    Object.assign(propsRef, props)
    const {
      visibilityHeight = 400, smooth = true, 'aria-label': ariaLabel,
      children, className,
    } = props
    const visible = inView.ready && !inView.isIn

    return h('div', { class: 'wf-backtop-host' }, [
      h('div', {
        class: 'wf-backtop-sentinel',
        style: { position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' },
        ref: sentinelRef,
      }),
      h('button', {
        type: 'button',
        class: [
          'wf-backtop',
          visible ? '' : 'wf-backtop--hidden',
          className,
        ].filter(Boolean).join(' '),
        'aria-label': ariaLabel ?? '回到顶部',
        onClick: () => {
          const scroller = propsRef.target ? propsRef.target() : window
          if (smooth && 'scrollTo' in scroller) {
            ;(scroller as Window).scrollTo({ top: 0, behavior: 'smooth' })
          } else if ('scrollTo' in scroller) {
            ;(scroller as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            scroller.scrollTop = 0
          }
        },
      }, children ?? h(Icon, { name: 'arrow-up', size: 16 })),
    ])
  }
}
