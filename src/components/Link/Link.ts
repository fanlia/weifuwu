/**
 * weifuwu/components — Link 文字链接
 *
 * 三库等价：EP Link / antd Typography.Link（内嵌）。
 * 语义色/下划线/disabled/新窗口/图标——原语 a 的组件化。
 *
 *   <Link href="/docs" variant="primary" icon="→">文档</Link>
 *
 * 裁剪（CS-05）：不做 hover 弹层预览/图标内置枚举（icon 任意 VNode）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface LinkProps {
  href?: string
  variant?: 'default' | 'primary' | 'danger' | 'muted'
  underline?: boolean
  disabled?: boolean
  target?: string
  icon?: any
  onClick?: (e: any) => void
  children?: any
}

export const Link: Component<LinkProps> = async (_init, _ctx: WfuiContext) =>
  (props) => {
    const {
      href, variant = 'default', underline = true, disabled, target, icon, onClick, children,
    } = props

    const cls = [
      'wf-link',
      `wf-link--${variant}`,
      underline === false && 'wf-link--no-underline',
      disabled && 'wf-link--disabled',
    ].filter(Boolean).join(' ')

    if (icon !== undefined) {
      const kids: any[] = [icon]
      if (Array.isArray(children)) kids.push(...children)
      else if (children !== undefined) kids.push(children)
      return h('a', { class: cls, href: disabled ? undefined : href, target, rel: target === '_blank' ? 'noopener noreferrer' : undefined, 'aria-disabled': disabled ? 'true' : undefined, onClick: disabled ? (e: any) => { e.preventDefault(); e.stopPropagation() } : onClick }, kids)
    }
    return h('a', { class: cls, href: disabled ? undefined : href, target, rel: target === '_blank' ? 'noopener noreferrer' : undefined, 'aria-disabled': disabled ? 'true' : undefined, onClick: disabled ? (e: any) => { e.preventDefault(); e.stopPropagation() } : onClick }, children)
  }
