/**
 * Wave — 点击水波纹动效（antd Wave 等价，纯 CSS 实现零依赖）
 *
 * 用法：<Wave><Button>提交</Button></Wave>——包装任意可点击元素
 * 实现：点击 → 在点击坐标生成波纹元素（absolute 圆形）→ 动画扩散消失
 * 纪律：动效走 --wf-dur-*；reduced-motion 自动降级（_base.css）
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'

export interface WaveProps {
  children?: any
  className?: string
  /** 波纹颜色（默认 currentColor 12% 透明） */
  color?: string
}

let waveSeq = 0

export const Wave: Component<WaveProps> = (_init, ctx) =>
  (props) => {
    const { children, className = '', color } = props

    const spawnRipple = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 2
      const x = e.clientX - rect.left - size / 2
      const y = e.clientY - rect.top - size / 2
      const ripple = (ctx.browser ?? createClientBrowser()).createElement('span') as HTMLSpanElement
      ripple.className = 'wf-wave-ripple'
      ripple.dataset.wid = `wave-${++waveSeq}`
      ripple.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;${color ? `background:${color};` : ''}`
      el.appendChild(ripple)
      // 动画结束移除（reduced-motion 下动画 0.01ms——等效瞬时）
      const done = () => ripple.remove()
      ripple.addEventListener('animationend', done, { once: true })
      // 兜底（animationend 丢失防泄漏）
      ctx.browser?.timeout?.(done, 600)
    }

    return h('span', {
      class: `wf-wave${className ? ` ${className}` : ''}`,
      onClick: (e: MouseEvent) => {
        // 透传原点击（包装不吞事件）
        spawnRipple(e)
      },
    }, children)
  }
