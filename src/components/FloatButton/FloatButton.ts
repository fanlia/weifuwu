/**
 * weifuwu/components — FloatButton 悬浮操作按钮
 *
 * 三库等价：antd FloatButton（特有——EP/shadcn 无独立等价）。
 * 固定视口定位 + badge + 组展开状态机：
 *
 *   <FloatButton icon={...} position="bottom-right" badge={5} onClick={...} />
 *   <FloatButtonGroup>
 *     <FloatButton icon={...} onClick={...} />
 *   </FloatButtonGroup>
 *
 * 裁剪（CS-05）：不做拖拽悬浮（Resizable 可组合）；回顶用 BackTop 语义更清晰。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type FloatButtonPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface FloatButtonProps {
  icon?: any
  badge?: number | string
  position?: FloatButtonPosition
  /** 'static'：组内子项（不 fixed——独立 fixed 会与主按钮重叠） */
  static?: boolean
  disabled?: boolean
  onClick?: () => void
  'aria-label'?: string
  children?: any
}

/** 单个悬浮按钮 */
export const FloatButton: Component<FloatButtonProps> = (_init, _ctx: WfuiContext) =>
  (props) => {
    const { icon, badge, position = 'bottom-right', static: isStatic, disabled, onClick, children } = props
    return h('button', {
      class: `wf-float-btn wf-float-btn--${position}${isStatic ? ' wf-float-btn--static' : ''}${disabled ? ' wf-float-btn--disabled' : ''}`,
      style: { position: isStatic ? undefined : 'fixed' },
      'aria-label': props['aria-label'],
      disabled,
      onClick: disabled ? undefined : onClick,
    }, [
      icon,
      children,
      badge !== undefined && badge !== null && h('span', { class: 'wf-float-btn-badge' }, String(badge)),
    ].filter(x => x !== undefined && x !== null && x !== false))
  }

export interface FloatButtonGroupProps {
  position?: FloatButtonPosition
  children?: any
}

/** 悬浮按钮组：主按钮展开/收起子按钮 */
export const FloatButtonGroup: Component<FloatButtonGroupProps> = (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let open = false

  return (props) => {
    const { position = 'bottom-right', children } = props
    const kids = Array.isArray(children) ? children : [children]
    return h('div', {
      class: `wf-float-group wf-float-group--${position}${open ? ' wf-float-group--open' : ''}`,
    }, [
      h('div', { class: 'wf-float-group-items' },
        open ? kids.map((k: any, i: number) => {
          // 子项注入 static（组内不 fixed——否则全部叠在右下角与主按钮重叠）
          const props = { ...(k.props ?? {}), static: true }
          const child = k.type ? { ...k, props } : k
          return h('div', { class: 'wf-float-group-item', key: i }, child)
        }) : []),
      h('button', {
        class: 'wf-float-group-main',
        'aria-label': open ? '收起' : '展开',
        'aria-expanded': open ? 'true' : 'false',
        onClick: () => { open = !open; ctx.ui.render() },
      }, h('span', { class: `wf-float-group-icon${open ? ' is-open' : ''}` }, '+')),
    ])
  }
}
