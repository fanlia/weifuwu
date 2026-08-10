import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface AvatarProps {
  name?: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  /** 指定背景色（覆盖按名字哈希的颜色），如按类型着色：user=蓝 / ai=紫 */
  color?: string
}

const COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export const Avatar: Component<AvatarProps> = (_init, _ctx) =>
  (props) => {
  const { name = '', src, size = 'md', color } = props
  const initial = name.trim()[0]?.toUpperCase() ?? '?'

  if (src) {
    return h('img', {
      class: `wf-avatar wf-avatar--${size}`,
      src,
      alt: name,
    })
  }

  return h('div', {
    class: `wf-avatar wf-avatar--${size}`,
    style: { background: color ?? hashColor(name) },
  }, initial)
}
