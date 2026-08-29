import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface AspectRatioProps {
  /** 宽/高比，默认 16/9 */
  ratio?: number
  children?: any
  className?: string
  [key: string]: any
}

/** 宽高比容器（对应 shadcn AspectRatio）：内容绝对定位填满，适合图片/视频/嵌入内容 */
export const AspectRatio: Component<AspectRatioProps> = (_init) =>
  (props) => {
    const { ratio, children, className, ...rest } = props
    return h('div', {
      class: ['wf-aspect-ratio', className].filter(Boolean).join(' '),
      style: { '--wf-aspect-ratio': ratio === undefined ? '16 / 9' : String(ratio) },
      ...rest,
    }, children)
  }
