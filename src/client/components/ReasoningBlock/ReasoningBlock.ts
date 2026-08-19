import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

/**
 * ReasoningBlock — CoT 推理过程折叠展示（AI 差异化）
 *
 * DeepSeek thinking 模式的 reasoning_content 展示层：折叠「已思考」头部，
 * 点击展开推理文本。流式（streaming）时头部带脉冲指示。
 *
 * 手动优先（组件库纪律）：let expanded + render()，无 $。
 *
 * ```tsx
 * <ReasoningBlock content={m.reasoning} streaming={m.status === 'streaming'} />
 * ```
 */
export interface ReasoningBlockProps {
  /** 推理文本（reasoning_content） */
  content: string
  /** 初始展开（默认折叠） */
  defaultExpanded?: boolean
  /** 折叠头部文案（默认「已思考」） */
  label?: string
  /** 流式中（头部脉冲指示） */
  streaming?: boolean
}

export const ReasoningBlock: Component<ReasoningBlockProps, UIContext> = async (initProps, ctx) => {
  let expanded = !!initProps.defaultExpanded

  return async (props) => {
    const { content, streaming, label = '已思考' } = props
    const toggle = () => { expanded = !expanded; ctx.render() }

    return h('div', {
      class: `wf-reasoning${streaming ? ' wf-reasoning--streaming' : ''}`,
    }, [
      h('button', {
        type: 'button',
        class: 'wf-reasoning-toggle',
        'aria-expanded': expanded,
        onClick: toggle,
        onKeyDown: (e: any) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
        },
      }, [
        h('span', { class: `wf-reasoning-chevron${expanded ? ' wf-reasoning-chevron--open' : ''}` }, h(Icon, { name: 'chevron-down' })),
        h('span', { class: 'wf-reasoning-label' }, streaming ? `${label}…` : label),
        streaming ? h('span', { class: 'wf-reasoning-dot', 'aria-hidden': 'true' }) : null,
      ]),
      h('div', {
        class: `wf-reasoning-body${expanded ? ' wf-reasoning-body--open' : ''}`,
        hidden: !expanded,
      }, content),
    ])
  }
}
