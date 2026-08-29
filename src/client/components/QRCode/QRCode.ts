import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { generateQr } from './qr.ts'
import type { QrEcLevel } from './qr.ts'

export interface QRCodeProps {
  /** 二维码内容（URL/文本） */
  value: string
  /** 纠错级别，默认 M */
  ecLevel?: QrEcLevel
  /** 渲染尺寸（px），默认 128 */
  size?: number
  /** 静默区模块数，默认 4 */
  quietZone?: number
  /** 模块颜色，默认 currentColor */
  color?: string
  /** 背景色（填充静默区），默认 transparent */
  bgColor?: string
  className?: string
}

/** 二维码（对应 antd QRCode）：自研 QR 编码器（版本 1-6，字节模式，8 掩码）→ SVG 渲染。
 * 零依赖（Reed-Solomon GF(256) 自实现）。 */
export const QRCode: Component<QRCodeProps> = (_init, _ctx) =>
  (props) => {
    const {
      value, ecLevel = 'M', size = 128, quietZone = 4,
      color = 'currentColor', bgColor, className,
    } = props

    const qr = generateQr(value, ecLevel)
    const q = quietZone

    const rects: any[] = []
    if (bgColor) {
      rects.push(h('rect', {
        class: 'wf-qr-bg',
        x: 0, y: 0,
        width: qr.size + q * 2, height: qr.size + q * 2,
        fill: bgColor,
      }))
    }
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.matrix[r][c]) {
          rects.push(h('rect', {
            x: c + q, y: r + q,
            width: 1, height: 1,
            fill: color,
          }))
        }
      }
    }

    const dim = qr.size + q * 2
    return h('svg', {
      class: ['wf-qr', className].filter(Boolean).join(' '),
      width: size,
      height: size,
      viewBox: `0 0 ${dim} ${dim}`,
      role: 'img',
      'aria-label': `二维码：${value}`,
      shapeRendering: 'crispEdges',
    }, rects)
  }
