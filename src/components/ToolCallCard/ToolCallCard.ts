import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'
import type { WfToolCall, WfToolProgress, WfToolResult } from '../../ai/types.ts'

/**
 * ToolCallCard — 工具调用卡片（wf: 协议 §4 交互原语）
 *
 * 纯展示组件：接收协议事件数据 + 可选回调，无内部状态。
 * 状态机：running（等待/执行中，带进度条）→ ok / error（有 result 时）。
 *
 * ```tsx
 * <ToolCallCard call={toolCall} progress={progress} result={result} />
 * ```
 */
export interface ToolCallCardProps {
  /** wf:tool_call 数据 */
  call: WfToolCall
  /** wf:tool_progress 数据（可选，展示进度条） */
  progress?: WfToolProgress
  /** wf:tool_result 数据（可选，ok/error 终态） */
  result?: WfToolResult
  /** 自定义参数渲染（默认 JSON.stringify） */
  renderArgs?: (args: Record<string, unknown>) => any
}

type ToolState = 'running' | 'ok' | 'error'

const stateIcon: Record<ToolState, IconName> = { running: 'settings', ok: 'check', error: 'close' }

export const ToolCallCard: Component<ToolCallCardProps> = (_init, _ctx) =>
  (props) => {
    const { call, progress, result, renderArgs } = props

    const state: ToolState = result ? (result.ok ? 'ok' : 'error') : 'running'

    const argsNode = renderArgs
      ? renderArgs(call.args)
      : h('code', { class: 'wf-toolcall-args' }, JSON.stringify(call.args))

    const progressNode = progress
      ? [
          progress.message
            ? h('div', { class: 'wf-toolcall-msg' }, `${progress.message} (${progress.step}/${progress.total})`)
            : null,
          h('div', { class: 'wf-toolcall-bar', role: 'progressbar', 'aria-valuenow': progress.step, 'aria-valuemax': progress.total }, [
            h('div', {
              class: 'wf-toolcall-bar-fill',
              style: { width: `${Math.min(100, (progress.step / Math.max(1, progress.total)) * 100)}%` },
            }),
          ]),
        ]
      : null

    const errorNode = result && !result.ok && result.error
      ? h('div', { class: 'wf-toolcall-error' }, `${result.error.code}: ${result.error.message}`)
      : null

    return h('div', { class: `wf-toolcall wf-toolcall--${state}` }, [
      h('div', { class: 'wf-toolcall-header' }, [
        h('span', { class: `wf-toolcall-icon wf-toolcall-icon--${state}` }, stateIcon[state]),
        h('span', { class: 'wf-toolcall-name' }, call.name),
      ]),
      h('div', { class: 'wf-toolcall-body' }, [argsNode, progressNode, errorNode].filter(Boolean)),
    ])
  }
