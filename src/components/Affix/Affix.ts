import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface AffixProps {
  /** 距视口顶部偏移，滚动超过该值后固定（px），默认 0 */
  offsetTop?: number
  /** 滚动容器（默认 window） */
  target?: () => HTMLElement | Window
  children?: any
  className?: string
  [key: string]: any
}

/** 固定定位（对应 antd/EP Affix）：滚动超过阈值后固定元素，保持占位与宽度
 * 实现：ctx.ui.useScrollPosition（全局 scroll 监听 + rAF 节流，内置方案）——
 * mount 时算一次阈值（sentinel 文档位置 - offsetTop），滚动位置响应式驱动 fixed 判定。
 * 不用 IO：IO 只在交叉状态变化时回调，瞬间滚动后 sentinel 从视口外下方到视口外上方
 * isIntersecting 都是 false → 不回调（Affix 需要连续位置跟踪，IO 语义不匹配）。 */
export const Affix: Component<AffixProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let wrapEl: HTMLElement | null = null
  let wrapWidth = 0
  // 初始 Infinity：首次 render 时 fixed=false（不误固定）；ref 挂载后微任务里算出真实阈值
  let threshold = Infinity
  let lastOffsetTop: number | undefined

  const propsRef: any = { ..._init }

  const getScroller = () => propsRef.target ? propsRef.target() : window
  const scroll = ctx.ui.useScrollPosition({ getScroller })

  // 阈值/宽度重算经 usePopupPosition 的 compute（scroll/resize 全局监听 + rAF 节流驱动，
  // 不再自建 window resize 监听）。rect 视口位置 + 当前滚动 = 文档位置；fixed = scrollY >= 文档位置 - offsetTop
  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => true,
    compute: (r) => {
      const scroller = getScroller()
      // 滚动量经 ctx.browser 统一（scrollingElement 优先——window.scrollY 在
      // 部分环境恒 0 会导致 threshold 漂移）；非 window 容器直接读 scrollTop
      const sy = scroller instanceof Window
        ? ctx.browser?.scrollTop() ?? 0
        : (scroller as HTMLElement).scrollTop ?? 0
      threshold = r.top + sy - (propsRef.offsetTop ?? 0)
      wrapWidth = r.width
      return { top: 0, left: 0 }
    },
  })

  const stableRef = (node: HTMLElement | null) => {
    if (node) {
      wrapEl = node
      // ref 在 appendChild 之前触发（元素未连接文档，rect 无效）→ 微任务里等连接后重算
      queueMicrotask(() => {
        pos.refresh()
        scroll.refresh()
      })
    } else {
      wrapEl = null
    }
  }

  return (props) => {
    Object.assign(propsRef, props)
    const { offsetTop = 0, children, className, ...rest } = props

    // offsetTop 运行时变化：重算阈值（非滚动帧的布局读取，可接受）
    if (offsetTop !== lastOffsetTop) {
      lastOffsetTop = offsetTop
      if (wrapEl) pos.refresh()
    }

    const fixed = scroll.y >= threshold

    return h('div', { class: ['wf-affix', className].filter(Boolean).join(' '), ...rest }, [
      h('div', {
        ref: stableRef,
        class: ['wf-affix-sentinel', fixed ? 'wf-affix-sentinel--active' : ''].join(' '),
      }),
      h('div', {
        class: ['wf-affix-content', fixed ? 'wf-affix-content--fixed' : ''].filter(Boolean).join(' '),
        style: fixed ? { position: 'fixed', top: `${offsetTop}px`, width: `${wrapWidth}px` } : undefined,
      }, children),
    ])
  }
}
