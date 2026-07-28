/**
 * weifuwu/components — Img
 */

import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'

export interface ImgProps {
  src?: string
  alt?: string
  fallback?: string
  loading?: 'lazy' | 'eager'
  width?: number | string
  height?: number | string
  className?: string
  style?: Record<string, string>
}

export const Img: Component<ImgProps> = (_init) =>
  (props) => {
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

    if (fallback) {
      imgProps.onError = (e: Event) => {
        const el = e.currentTarget as HTMLImageElement
        if (el.src !== fallback) el.src = fallback
      }
    }

    return h('img', imgProps)
  }
