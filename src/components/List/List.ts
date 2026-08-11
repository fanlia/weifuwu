/**
 * weifuwu/components — List
 *
 * 通用列表：items + renderItem + header/footer/empty 占位。
 * 定位：Table 大材小用的消息/文件/成员列表场景。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface ListProps<T = any> {
  items: T[]
  renderItem: (item: T, index: number) => any
  divided?: boolean
  header?: any
  footer?: any
  emptyText?: string
  emptyIcon?: any
  className?: string
}

export const List: Component<ListProps> = async (_init, _ctx) =>
  async (props) => {
    const { items, renderItem, divided, header, footer, emptyText = '暂无数据', emptyIcon, className } = props

    const body = items.length === 0
      ? h('div', { class: 'wf-list-empty' }, [emptyIcon ?? null, h('span', {}, emptyText)].filter(Boolean))
      : items.map((it, i) => h('li', { key: i, class: 'wf-list-item' }, renderItem(it, i)))

    return h('div', { class: `wf-list${divided ? ' wf-list--divided' : ''}${className ? ` ${className}` : ''}` }, [
      header ? h('div', { class: 'wf-list-header' }, header) : null,
      h('ul', { class: 'wf-list-body' }, body),
      footer ? h('div', { class: 'wf-list-footer' }, footer) : null,
    ].filter(Boolean))
  }
