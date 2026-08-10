/**
 * weifuwu/components — Descriptions
 *
 * 详情字段展示：label/value 栅格（<dl> 语义结构，屏幕阅读器友好）。
 * 用于 Agent 配置展示、实体详情、订单信息等只读字段场景。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface DescriptionItem {
  label: any
  value: any
  /** 跨列数（栅格列，默认 1） */
  span?: number
}

export interface DescriptionsProps {
  items: DescriptionItem[]
  column?: 1 | 2 | 3 | 4
  bordered?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const Descriptions: Component<DescriptionsProps> = (_init, _ctx) =>
  (props) => {
    const { items, column = 1, bordered, size = 'md', className } = props

    const rows = items.map((it, i) =>
      h('div', {
        key: i,
        class: 'wf-descriptions-item',
        style: it.span && it.span > 1 ? { gridColumn: `span ${it.span}` } : undefined,
      }, [
        h('dt', { class: 'wf-descriptions-label' }, it.label),
        h('dd', { class: 'wf-descriptions-value' }, it.value),
      ]))

    return h('dl', {
      class: `wf-descriptions wf-descriptions--${column} wf-descriptions--${size}${bordered ? ' wf-descriptions--bordered' : ''}${className ? ` ${className}` : ''}`,
    }, rows)
  }
