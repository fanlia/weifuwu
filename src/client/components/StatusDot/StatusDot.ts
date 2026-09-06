/** StatusDot：状态点（on/tone 语义——label 缺省只渲染点）（showcase /components/statusdot） */
import type { Component, VNodeChild } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Badge } from '../Badge/Badge.ts'

/**
 * weifuwu/client/components — StatusDot
 *
 * 状态点原语（颜色语义——一个状态一个声音）。
 * 契约（agent-platform StatusDot 语言化——原名「自带默认文案的运行中/已暂停」
 * 与调用方状态标签撞车——双标签实证修复）：
 * - **label 缺省只渲染点**（文字是调用方职责——防双标签）
 * - tone 覆盖点/文字色：success 绿（健康运行）· warning 黄（降级）·
 *   error 红（故障）· default 灰（非活跃）
 * - on 是主开关（true→success · false→default）——tone 仅在非绿非灰时传
 *
 * 来源：agent-platform ui.tsx StatusDot（平台原语——库无状态点面——
 * 入库：通用状态语义组件）。
 */

export interface StatusDotProps {
  /** 状态开关（true→success · false→default） */
  on?: boolean
  /** 状态文案（缺省只渲染点——文字是调用方职责） */
  label?: VNodeChild
  /** 覆盖色（非绿非灰时传——降级/故障） */
  tone?: 'success' | 'warning' | 'error' | 'default'
}

export const StatusDot: Component<StatusDotProps> = (_init, _ctx)=>
  (props)=> {
    const on = props.on ?? false
    const tone = props.tone ?? (on ? 'success' : 'default')
    const textClass = tone === 'success' ? 'wf-text-success'
      : tone === 'error' ? 'wf-text-error'
      : tone === 'warning' ? 'wf-text-warning'
      : 'wf-text-tertiary'

    return h('span', { class: 'wf-row wf-gap-xs wf-font-sm' }, [
      h(Badge, { dot: true, variant: tone }),
      props.label != null && h('span', { class: textClass }, props.label),
    ])
  }
