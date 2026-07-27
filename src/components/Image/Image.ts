/**
 * weifuwu/components — Image
 *
 * `<img>` 增强组件。支持 fallback、loading="lazy"。
 */

import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export interface ImageProps {
  src?: string
  alt?: string
  fallback?: string
  loading?: 'lazy' | 'eager'
  width?: number | string
  height?: number | string
  className?: string
  style?: Record<string, string>
}

export const Image: Component<ImageProps> = (props) => {
  const { src, alt = '', fallback, loading, width, height, className, style } = props

  const imgProps: Record<string, any> = {
    class: ['wf-image', className].filter(Boolean).join(' '),
    src: src ?? fallback ?? '',
    alt,
    loading: loading ?? 'lazy',
  }

  if (width !== undefined) imgProps.width = width
  if (height !== undefined) imgProps.height = height
  if (style) imgProps.style = style

  // fallback: src 加载失败时替换
  if (fallback) {
    imgProps.onError = (e: Event) => {
      const el = e.currentTarget as HTMLImageElement
      if (el.src !== fallback) el.src = fallback
    }
  }

  return h('img', imgProps)
}
