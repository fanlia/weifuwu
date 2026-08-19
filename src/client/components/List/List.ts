/**
 * weifuwu/components — List
 *
 * 通用列表：items + renderItem + header/footer/empty 占位。
 * 定位：Table 大材小用的消息/文件/成员列表场景。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface ListProps<T = any> {
  items: T[]
  renderItem: (item: T, index: number) => any
  /** 自定义项 key（可选，默认数组下标）——renderItem 渲染有内部状态的组件且列表动态增删/重排时传
   * 身份跟随内容的 key（如项 id），否则默认下标 = 位置身份，增删后项状态会继承错位（规则表 §3） */
  keyBy?: (item: T, index: number) => string | number
  divided?: boolean
  header?: any
  footer?: any
  emptyText?: string
  emptyIcon?: any
  className?: string
}

export const List: Component<ListProps> = async (_init, _ctx) =>
  async (props) => {
    const { items, renderItem, divided, header, footer, emptyText = '暂无数据', emptyIcon, className, keyBy } = props

    const body = items.length === 0
      ? h('div', { class: 'wf-list-empty' }, [emptyIcon ?? null, h('span', {}, emptyText)].filter(Boolean))
      : items.map((it, i) => h('li', { key: keyBy ? keyBy(it, i) : i, class: 'wf-list-item' }, renderItem(it, i)))

    return h('div', { class: `wf-list${divided ? ' wf-list--divided' : ''}${className ? ` ${className}` : ''}` }, [
      header ? h('div', { class: 'wf-list-header' }, header) : null,
      h('ul', { class: 'wf-list-body' }, body),
      footer ? h('div', { class: 'wf-list-footer' }, footer) : null,
    ].filter(Boolean))
  }
