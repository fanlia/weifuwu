/**
 * weifuwu/components — Skeleton
 */

import type { Component } from '../../ui-dom/vnode.ts'
import { h, Fragment } from '../../ui-dom/vnode.ts'

export type SkeletonVariant = 'text' | 'circle' | 'rect' | 'image' | 'avatar' | 'table'

export interface SkeletonProps {
  variant?: SkeletonVariant
  lines?: number
  cols?: number
  width?: number | string
  height?: number | string
  className?: string
}

export const Skeleton: Component<SkeletonProps> = async (_init) =>
  async (props) => {
    const { variant = 'text', lines = 1, cols = 3, width, height, className } = props

    const style: Record<string, string> = {}
    if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width
    if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height

    const cls = [
      'wf-skeleton',
      `wf-skeleton--${variant}`,
      className,
    ].filter(Boolean).join(' ')

    if (variant === 'table') {
      const rows = Array.from({ length: lines }, (_, r) => {
        const cells = Array.from({ length: cols }, (_, c) => {
          const cellW = r === lines - 1 && c === cols - 1 ? '40%' : undefined
          return h('div', {
            class: 'wf-skeleton wf-skeleton--text',
            style: cellW ? { width: cellW } : undefined,
          })
        })
        return h('div', { class: 'wf-skeleton-row' }, cells)
      })
      return h('div', { class: 'wf-skeleton-table' }, rows)
    }

    if (lines <= 1) {
      return h('div', { class: cls, style: Object.keys(style).length ? style : undefined })
    }

    const items = Array.from({ length: lines }, (_, i) => {
      const itemCls = i === lines - 1 && lines > 1
        ? `${cls} wf-skeleton--short`
        : cls
      return h('div', { class: itemCls, style: Object.keys(style).length ? style : undefined })
    })

    return h(Fragment, null, items)
  }
