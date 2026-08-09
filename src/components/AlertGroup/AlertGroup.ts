/**
 * weifuwu/components — AlertGroup 通知合并组
 *
 * 三库等价：EP AlertGroup（2.8 新增）。
 * 同类通知合并折叠：≥3 条折叠为摘要 +N，点击展开：
 *
 *   <AlertGroup items={[{ id, message, time }]} onClose={...} />
 *
 * 裁剪（CS-05）：合并阈值固定 3 条起（少于此退化为平铺）；
 * 不做时间线分组/虚拟化。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface AlertGroupItem {
  id: string
  message: any
  time?: string
  variant?: 'info' | 'success' | 'warning' | 'error'
}

export interface AlertGroupProps {
  items: AlertGroupItem[]
  onClose?: (id: string) => void
}

const THRESHOLD = 3

export const AlertGroup: Component<AlertGroupProps> = (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let expanded = false

  return (props) => {
    const { items, onClose } = props
    const collapsible = items.length >= THRESHOLD

    const itemRow = (item: AlertGroupItem) =>
      h('div', {
        class: `wf-alertgroup-item wf-alertgroup-item--${item.variant ?? 'info'}`,
        key: item.id,
      }, [
        h('span', { class: 'wf-alertgroup-message' }, item.message),
        item.time && h('span', { class: 'wf-alertgroup-time' }, item.time),
        onClose && h('button', {
          class: 'wf-alertgroup-close',
          'aria-label': '关闭',
          onClick: () => onClose(item.id),
        }, h(Icon, { name: 'close' })),
      ])

    const visible = collapsible && !expanded ? items.slice(0, 1) : items

    return h('div', { class: 'wf-alertgroup', role: 'group' }, [
      collapsible && !expanded
        ? h('button', { class: 'wf-alertgroup-summary', onClick: () => { expanded = true; ctx.ui.render() } },
            h('span', {}, `+${items.length} 条通知`))
        : null,
      expanded && collapsible
        ? h('div', { class: 'wf-alertgroup-list wf-alertgroup-list--open' }, visible.map(itemRow))
        : h('div', { class: 'wf-alertgroup-list' }, visible.map(itemRow)),
    ])
  }
}
