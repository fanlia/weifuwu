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

export const Avatar: Component<AvatarProps> = async (_init, _ctx) =>
  async (props) => {
  const { name = '', src, size = 'md', color } = props
  // 按码点取首字符（Array.from 而非 name[0]）——emoji 是代理对，name[0]
  // 会切出孤立代理项（\ud83d 等），写入文本节点会让 Chrome 的 AX 树/布局
  // 计算挂死（agent-platform 部门页整页 a11y snapshot 挂死/为空的根因）
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'

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
