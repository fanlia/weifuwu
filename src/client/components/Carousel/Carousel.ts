import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CarouselProps {
  children: any[]
  /** 自动播放 */
  autoplay?: boolean
  /** 自动播放间隔（ms），默认 3000 */
  interval?: number
  showArrows?: boolean
  showDots?: boolean
  /** 循环播放（尾 → 头），默认 true */
  loop?: boolean
  'aria-label'?: string
  className?: string
}

/** 轮播（对应 antd/EP/shadcn Carousel）：横向滑动 + 箭头/圆点 + 自动播放 + 触摸滑动。
 * 裁剪（CS-05，见 docs/client.md）：垂直模式、多图联动、淡入淡出（fade 用 CSS 可配）。 */
export const Carousel: Component<CarouselProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let index = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let startX = 0

  // 定时器纪律（AGENTS.md #12）：autoplay interval 工厂期声明 + hold 注册清理——
  // render 只声明意图（latest* 引用同步），创建/重启经 queueMicrotask 出渲染
  // 窗口（effect-guard 合法——Affix/LogViewer 同款延迟模式）；SSR 端零定时器。
  // （旧实现经 ref 回调管理——挂载后 autoplay prop 变化不重启——已根治）
  let goToRef: (i: number) => void = () => {}
  let latestAutoplay = false
  let latestInterval = 3000
  let runningInterval = 0
  const stopAuto = () => {
    if (timer) { clearInterval(timer); timer = undefined }
  }
  const syncAuto = () => {
    if (typeof window === 'undefined') return // SSR 一次性渲染——零定时器驻留
    if (!latestAutoplay) { stopAuto(); return }
    if (timer && runningInterval === latestInterval) return // 幂等——同间隔不重启
    stopAuto()
    runningInterval = latestInterval
    timer = setInterval(() => goToRef(index + 1), latestInterval)
  }
  ctx.ui.hold(stopAuto)

  return (props) => {
    const {
      children = [], autoplay, interval = 3000,
      showArrows = true, showDots = true, loop = true,
      'aria-label': ariaLabel, className,
    } = props

    const count = children.length
    if (count === 0) { stopAuto(); return null }

    const goTo = (i: number) => {
      const clamped = loop
        ? (i + count) % count
        : Math.max(0, Math.min(i, count - 1))
      if (clamped !== index) {
        index = clamped
        ctx.render()
      }
    }
    goToRef = goTo
    latestAutoplay = !!autoplay
    latestInterval = interval
    queueMicrotask(syncAuto) // 意图声明——创建/重启出渲染窗口（幂等）

    const next = () => goTo(index + 1)
    const prev = () => goTo(index - 1)

    const touchProps = {
      onTouchStart: (e: any) => { startX = e.touches[0].clientX },
      onTouchEnd: (e: any) => {
        const dx = e.changedTouches[0].clientX - startX
        if (Math.abs(dx) > 40) {
          if (dx < 0) next()
          else prev()
        }
      },
    }

    const track = h('div', {
      class: 'wf-carousel-track',
      style: { transform: `translateX(-${index * 100}%)` },
    }, children)

    const arrows = showArrows ? [
      h('button', {
        type: 'button',
        class: 'wf-carousel-arrow wf-carousel-arrow--prev',
        'aria-label': '上一张',
        onClick: prev,
      }, h(Icon, { name: 'chevron-left', size: 18 })),
      h('button', {
        type: 'button',
        class: 'wf-carousel-arrow wf-carousel-arrow--next',
        'aria-label': '下一张',
        onClick: next,
      }, h(Icon, { name: 'chevron-right', size: 18 })),
    ] : []

    const dots = showDots ? h('div', {
      class: 'wf-carousel-dots',
    }, children.map((_, i) =>
      h('button', {
        type: 'button',
        class: `wf-carousel-dot${i === index ? ' wf-carousel-dot--active' : ''}`,
        key: i,
        'aria-label': `第 ${i + 1} 张`,
        onClick: () => goTo(i),
      })
    )) : null

    return h('div', {
      class: ['wf-carousel', className].filter(Boolean).join(' '),
      'aria-label': ariaLabel,
      ...touchProps,
    }, [
      h('div', { class: 'wf-carousel-viewport' }, track),
      ...arrows,
      dots,
    ].filter(Boolean))
  }
}
