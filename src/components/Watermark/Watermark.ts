import type { Component } from '../../client/vnode.ts'
import { createClientBrowser } from '../../client/browser.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface WatermarkProps {
  /** 水印文字 */
  text?: string
  fontSize?: number
  /** 文字颜色（默认继承） */
  color?: string
  /** 透明度 0-1，默认 0.15 */
  opacity?: number
  /** 旋转角度（度），默认 -25 */
  rotate?: number
  /** 平铺间距（px），默认 100 */
  gap?: number
  children?: any
  className?: string
}

/** 水印（对应 antd Watermark）：canvas 绘制平铺文字 + overlay 覆盖内容（pointer-events none）。
 * 裁剪：图片水印、多行文字、动态旋转。 */
export const Watermark: Component<WatermarkProps> = (_init, _ctx) => {
  const _browser = _ctx?.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let bgImage = ''
  // 稳定 ref：render 层的 props 经 latest 引用读取（ref 定义在 mount 作用域，
  // 避免内联 ref 每次渲染换引用触发 ref-diff churn）
  let latest: { text: string; fontSize: number; color: string; opacity: number; rotate: number; gap: number } = {
    text: 'weifuwu', fontSize: 14, color: 'currentColor', opacity: 0.15, rotate: -25, gap: 100,
  }
  const overlayRef = (el: HTMLElement | null) => {
    if (el && !bgImage) {
      draw(latest.text, latest.fontSize, latest.color, latest.opacity, latest.rotate, latest.gap)
      if (bgImage) el.style.backgroundImage = `url(${bgImage})`
    }
  }

  const draw = (text: string, fontSize: number, color: string, opacity: number, rotate: number, gap: number) => {
    const canvas = _browser?.createElement('canvas')
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    const { width } = ctx2d.measureText(text)
    const tileW = Math.max(width + gap, gap)
    const tileH = gap
    canvas.width = tileW
    canvas.height = tileH
    ctx2d.globalAlpha = opacity
    ctx2d.font = `${fontSize}px sans-serif`
    ctx2d.fillStyle = color
    ctx2d.translate(tileW / 2, tileH / 2)
    ctx2d.rotate((rotate * Math.PI) / 180)
    ctx2d.fillText(text, -width / 2, 0)
    bgImage = canvas.toDataURL()
  }

  return (props) => {
    const {
      text = 'weifuwu', fontSize = 14, color = 'currentColor', opacity = 0.15,
      rotate = -25, gap = 100, children, className,
    } = props

    latest = { text, fontSize, color, opacity, rotate, gap }

    return h('div', {
      class: ['wf-watermark', className].filter(Boolean).join(' '),
    }, [
      children,
      h('div', {
        class: 'wf-watermark-overlay',
        style: { pointerEvents: 'none', backgroundImage: bgImage ? `url(${bgImage})` : undefined },
        ref: overlayRef,
      }),
    ])
  }
}
