import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface BackTopProps {
  /** 滚动超过此高度显示（px），默认 400 */
  visibilityHeight?: number
  /** 滚动容器（默认 window） */
  target?: () => HTMLElement | Window
  /** 平滑滚动，默认 true */
  smooth?: boolean
  /** 方向（默认 'top'——回顶；'bottom'——聊天流回底浮钮） */
  direction?: 'top' | 'bottom'
  /** fixed 定位（默认 true——页面级）；容器内浮钮传 false（absolute——祖先需 position:relative） */
  fixed?: boolean
  'aria-label'?: string
  children?: any
  className?: string
}

type Scroller = HTMLElement | Window

/** 回到顶部/底部（对应 EP Backtop / antd FloatButton.BackTop）：滚动超阈值显示，点击回位
 *
 * 实现：scroll 监听（window/容器统一——阈值翻转才重渲染——无轮询无 IO）。
 * 历史：IO 哨兵方案（useInView 观察 absolute 哨兵）在「容器滚动 + 组件渲染在
 * 容器外」组合失效（sentinel 固定于 root 可视区——isIn 恒 true——浮钮永不显示——
 * agent-browser 实测 2026-09）——chat 首用暴露——统一 scroll 监听。 */
export const BackTop: Component<BackTopProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let scroller: Scroller | null = null
  let visible = false
  const propsRef: any = {}

  const handler = () => {
    const v = propsRef.visibilityHeight ?? 400
    const next = scroller instanceof Window
      ? (window.scrollY ?? document.documentElement.scrollTop) > v
      : ((scroller as HTMLElement).scrollHeight - (scroller as HTMLElement).scrollTop - (scroller as HTMLElement).clientHeight) > v
    if (next !== visible) { visible = next; ctx.render() }
  }

  const attach = () => {
    const t = propsRef.target?.() ?? window
    if (!t) { requestAnimationFrame(attach); return } // target 暂未就绪（ref 时序）——下一帧重试
    scroller = t as Scroller
    scroller.addEventListener('scroll', handler, { passive: true })
    handler() // 初始状态
  }

  let attached = false
  ctx.ui.hold(() => {
    scroller?.removeEventListener('scroll', handler)
    scroller = null
  })

  return (props) => {
    Object.assign(propsRef, props)
    // attach 需在首次 render 后：工厂期 propsRef 为空——target 读到 undefined →
    // 回退 window——容器滚动永不触发（agent-browser 实测 2026-09）
    if (!attached) { attached = true; attach() }
    const {
      direction = 'top', smooth = true, 'aria-label': ariaLabel, children,
      className, fixed = true,
    } = props
    const isBottom = direction === 'bottom'
    const r = () => {
      if (!scroller) return 0
      return scroller instanceof Window
        ? document.documentElement.scrollHeight
        : (scroller as HTMLElement).scrollHeight
    }

    return h('button', {
      type: 'button',
      class: [
        'wf-backtop',
        fixed ? '' : 'wf-backtop--inline',
        visible ? '' : 'wf-backtop--hidden',
        className,
      ].filter(Boolean).join(' '),
      'aria-label': ariaLabel ?? (isBottom ? '回到底部' : '回到顶部'),
      onClick: () => {
        if (!scroller) return
        const top = isBottom ? r() : 0
        ;(scroller as any).scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
      },
    }, children ?? h(Icon, { name: isBottom ? 'arrow-down' : 'arrow-up', size: 16 }))
  }
}
