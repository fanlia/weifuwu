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
 * 裁剪（CS-05，见 design/components-cuts.md）：垂直模式、多图联动、淡入淡出（fade 用 CSS 可配）。 */
export const Carousel: Component<CarouselProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let index = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let startX = 0

  // 稳定 ref（mount 作用域，ref 纪律）：render 阶段值经 latest* 引用读取
  let goToRef: (i: number) => void = () => {}
  let latestAutoplay = false
  let latestInterval = 3000
  const stableRef = (el: HTMLElement | null) => {
    if (el) {
      if (latestAutoplay) {
        clearInterval(timer)
        timer = setInterval(() => goToRef(index + 1), latestInterval)
      }
    } else {
      clearInterval(timer)
      timer = undefined
    }
  }

  return async (props) => {
    const {
      children = [], autoplay, interval = 3000,
      showArrows = true, showDots = true, loop = true,
      'aria-label': ariaLabel, className,
    } = props

    const count = children.length
    if (count === 0) return null

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
      ref: stableRef,
      ...touchProps,
    }, [
      h('div', { class: 'wf-carousel-viewport' }, track),
      ...arrows,
      dots,
    ].filter(Boolean))
  }
}
