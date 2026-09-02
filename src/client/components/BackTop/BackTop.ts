import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface BackTopProps {
  /** 滚动超过此高度显示（px），默认 400 */
  visibilityHeight?: number
  /** 滚动容器（默认 window；未就绪返回 null——attach 等待 render 重试） */
  target?: () => HTMLElement | Window | null
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
  let win: Window | null = null
  const propsRef: any = {}

  const handler = () => {
    const v = propsRef.visibilityHeight ?? 400
    const next = scroller === win
      ? (win as Window).scrollY > v
      : ((scroller as HTMLElement).scrollHeight - (scroller as HTMLElement).scrollTop - (scroller as HTMLElement).clientHeight) > v
    if (next !== visible) { visible = next; ctx.render() }
  }

  const attach = () => {
    if (scroller) return // 幂等——render 重试机制防重复 listener
    const tFn = propsRef.target
    if (tFn && !tFn()) return // target 声明但未就绪（ref 时序）——每次 render 重试
    // **浏览器环境纪律（§5.5）**：经 ctx.browser 注入——零全局 window/document
    // 直接访问（SSR node 无 window——直接引用 = renderFn 抛错 → hole 降级 →
    // SSR 吸收失败链——backtop 页实证 2027-xx——本次修复根因）
    win = ctx.browser?.window ?? null
    if (!win) return // SSR/测试（无浏览器）——不绑定——render 恒隐（客户端首帧后重试）
    scroller = (tFn ? tFn() : win) as Scroller
    scroller.addEventListener('scroll', handler, { passive: true })
    handler() // 初始状态
  }

  ctx.ui.hold(() => {
    scroller?.removeEventListener('scroll', handler)
    scroller = null
  })

  return (props) => {
    Object.assign(propsRef, props)
    // attach 需在 target 就绪后：ref（app 层）在 apply 阶段设置——build 期读取为
    // undefined → 回退 window——容器滚动永不触发（agent-browser 实测 2026-09）。
    // 每次 render 重试：bodyEl 就绪后的下一次 render 必命中（无 rAF——不可靠）
    attach()
    const {
      direction = 'top', smooth = true, 'aria-label': ariaLabel, children,
      className, fixed = true,
    } = props
    const isBottom = direction === 'bottom'
    const r = () => {
      if (!scroller) return 0
      return scroller === win
        ? (win as Window).document.documentElement.scrollHeight
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
