/**
 * weifuwu/components — Skeleton
 *
 * 骨架屏占位组件。纯 CSS，无交互，无状态。
 *
 * 用法：
 *   <Skeleton />                    ← 单行文本
 *   <Skeleton lines={3} />          ← 多行段落
 *   <Skeleton variant="circle" />   ← 圆形头像
 *   <Skeleton variant="rect" w={200} h={120} />  ← 矩形区域
 */

import type { Component } from '../../client/vnode.ts'
import { h, Fragment } from '../../client/vnode.ts'

export type SkeletonVariant = 'text' | 'circle' | 'rect'

export interface SkeletonProps {
  variant?: SkeletonVariant
  lines?: number
  width?: number | string
  height?: number | string
  className?: string
}

export const Skeleton: Component<SkeletonProps> = (props) => {
  const { variant = 'text', lines = 1, width, height, className } = props

  const style: Record<string, string> = {}
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height

  const cls = [
    'wf-skeleton',
    `wf-skeleton--${variant}`,
    className,
  ].filter(Boolean).join(' ')

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
