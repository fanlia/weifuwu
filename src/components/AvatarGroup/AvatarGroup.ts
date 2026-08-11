/**
 * weifuwu/components — AvatarGroup
 *
 * 堆叠头像组（负 margin 重叠）+ max 溢出显示 +N。
 * 用于群聊成员、协作人列表。
 * 裁剪：不做 hover 展开 tooltip（见 roadmap）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Avatar, type AvatarProps } from '../Avatar/Avatar.ts'

export interface AvatarGroupItem {
  name?: string
  src?: string
  color?: string
}

export interface AvatarGroupProps {
  items: AvatarGroupItem[]
  max?: number
  size?: AvatarProps['size']
  className?: string
}

export const AvatarGroup: Component<AvatarGroupProps> = async (_init, _ctx) =>
  async (props) => {
    const { items, max, size, className } = props
    if (!items || items.length === 0) return null

    const visible = max && items.length > max ? items.slice(0, max) : items
    const hiddenCount = max ? Math.max(0, items.length - max) : 0

    const avatars = visible.map((it, i) =>
      h('span', { key: i, class: 'wf-avatar-group-item' },
        h(Avatar, { name: it.name, src: it.src, color: it.color, size })))

    const more = hiddenCount > 0
      ? h('span', { class: 'wf-avatar-group-more', role: 'img', 'aria-label': `还有 ${hiddenCount} 人` }, `+${hiddenCount}`)
      : null

    return h('div', { class: `wf-avatar-group${className ? ` ${className}` : ''}` },
      [...avatars, more].filter(Boolean))
  }
