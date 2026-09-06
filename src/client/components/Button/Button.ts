/** Button：4 variants × 3 sizes + loading + block + disabled（showcase /components/button） */
/**
 * weifuwu/components — Button
 *
 * 2027-09 W3：状态类（variant/size/block/loading）+ aria-busy → createComponent
 * 声明（BEM 直拼单源）——render 只写结构/内容/事件（皮）。
 */

import type {VNodeChild, UIContext} from '../../vdom/index.ts'
import { h, createComponent } from '../../vdom/index.ts'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
  /** 透传 DOM id（测试定位/锚点） */
  id?: string
  /** 透传原生 class（覆盖默认 wf-btn 组合） */
  class?: string
  /** 透传无障碍标签（读屏/测试定位——按钮常仅图标无文本，name 缺失即死读屏路径） */
  'aria-label'?: string
  onClick?: (e: MouseEvent)=> void
  children?: VNodeChild}

export const Button = createComponent<ButtonProps>({
  class: 'wf-btn',
  enumStates: { variant: null, size: null },
  boolStates: { block: 'wf-btn--block', loading: 'wf-btn--loading' },
  ariaBools: { loading: 'aria-busy' },
  render: (root, props, ctx) => {
    const { loading, disabled, type, onClick, children } = props
    const L = ctx?.i18n?.components?.Button ?? {}
    return h('button', {
      ...root,
      id: props.id,
      title: props.title,
      type: type ?? 'button',
      disabled: disabled || loading || undefined,
      'aria-label': props['aria-label'],
      onClick,
    }, loading
      ? [h('span', { class: 'wf-btn-spinner' }), L.loading ?? '加载中...']
      : children)
  },
})
