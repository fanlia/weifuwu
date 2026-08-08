/**
 * weifuwu/components — Timeline
 *
 * 竖向时间线：节点（状态色圆点/自定义）+ 标题 + 时间 + 内容 + 连接线。
 * 用于执行日志、审批历史、审计记录。
 * 裁剪：不做横向时间线/折叠节点（见 roadmap）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type TimelineStatus = 'default' | 'info' | 'success' | 'warning' | 'error'

export interface TimelineItem {
  key: string
  title: any
  time?: string
  content?: any
  status?: TimelineStatus
  /** 自定义节点内容（覆盖状态圆点） */
  dot?: any
  onClick?: () => void
}

export interface TimelineProps {
  items: TimelineItem[]
  mode?: 'left' | 'alternate'
  reverse?: boolean
}

export const Timeline: Component<TimelineProps> = (_init, _ctx) =>
  (props) => {
    const { items, mode = 'left', reverse } = props
    const list = reverse ? [...items].reverse() : items

    const lis = list.map((item, i) => {
      const { key, title, time, content, status = 'default', dot, onClick } = item

      const node = h('div', {
        class: `wf-timeline-node wf-timeline-node--${status}`,
      }, dot ?? null)

      const head = h('div', { class: 'wf-timeline-head' }, [
        h('span', { class: 'wf-timeline-title' }, title),
        time ? h('span', { class: 'wf-timeline-time' }, time) : null,
      ].filter(Boolean))

      const body = content != null
        ? h('div', { class: 'wf-timeline-content' }, content)
        : null

      const col = h('div', { class: 'wf-timeline-col' }, [head, body].filter(Boolean))

      const altClass = mode === 'alternate'
        ? (i % 2 === 0 ? ' wf-timeline-item--alt-left' : ' wf-timeline-item--alt-right')
        : ''

      return h('li', {
        key,
        class: `wf-timeline-item${onClick ? ' wf-timeline-item--clickable' : ''}${altClass}`,
        role: onClick ? 'button' : undefined,
        tabIndex: onClick ? 0 : undefined,
        onClick,
        onKeyDown: onClick
          ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }
          : undefined,
      }, [node, col])
    })

    return h('ul', { class: 'wf-timeline' }, lis)
  }
