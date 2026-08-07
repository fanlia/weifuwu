import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { WfApprovalRequest } from '../../ai/types.ts'

/**
 * ApprovalCard — 人工审批卡片（wf: 协议 §4.5 交互原语）
 *
 * 状态机：pending（待批，允许/拒绝 + 备注）→ approved / rejected / timeout（终态）。
 * 纯受控组件：决策回传由 onApprove / onReject 上抛（app 负责 POST /approve）。
 *
 * ```tsx
 * <ApprovalCard
 *   request={approvalReq}
 *   onApprove={() => respond('approved')}
 *   onReject={(note) => respond('rejected', note)}
 * />
 * ```
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout'

export interface ApprovalCardProps {
  /** wf:approval_request 数据 */
  request: WfApprovalRequest
  /** 卡片状态（默认 pending） */
  status?: ApprovalStatus
  /** 用户点"允许" */
  onApprove?: () => void
  /** 用户点"拒绝"，note 为可选备注（进 agent 上下文） */
  onReject?: (note?: string) => void
  /** 自定义详情渲染（默认显示 name + args） */
  renderDetail?: (request: WfApprovalRequest) => any
}

const statusText: Record<ApprovalStatus, string> = {
  pending: '等待审批',
  approved: '已批准',
  rejected: '已拒绝',
  timeout: '审批超时',
}

export const ApprovalCard: Component<ApprovalCardProps> = (_init, ctx) => {
  // ── 手动状态（组件库约定：mount 作用域 let + render，不依赖 $）──
  let note = ''
  let showNote = false

  return (props) => {
    const { request, status = 'pending', onApprove, onReject, renderDetail } = props

    const detail = renderDetail
      ? renderDetail(request)
      : [
          h('div', { class: 'wf-approval-name' }, request.name),
          h('code', { class: 'wf-approval-args' }, JSON.stringify(request.args)),
        ]

    const actions = status === 'pending'
      ? h('div', { class: 'wf-approval-actions' }, [
          showNote
            ? h('div', { class: 'wf-approval-note' }, [
                h('input', {
                  class: 'wf-approval-note-input',
                  placeholder: '备注（拒绝原因，将进入 agent 上下文）…',
                  value: note,
                  onInput: (e: any) => { note = e.target.value },
                }),
              ])
            : null,
          h('div', { class: 'wf-approval-btns' }, [
            h('button', {
              class: 'wf-btn wf-btn--primary wf-btn--sm',
              type: 'button',
              onClick: () => onApprove?.(),
            }, '允许'),
            h('button', {
              class: 'wf-btn wf-btn--danger wf-btn--sm',
              type: 'button',
              onClick: () => {
                if (!showNote) { showNote = true; ctx.ui.render(); return }
                onReject?.(note)
              },
            }, showNote ? '确认拒绝' : '拒绝'),
          ]),
        ].filter(Boolean))
      : h('div', { class: `wf-approval-status wf-approval-status--${status}` }, statusText[status])

    return h('div', { class: `wf-approval wf-approval--${status}` }, [
      h('div', { class: 'wf-approval-header' }, [
        h('span', { class: 'wf-approval-icon' },
          h(Icon, { name: status === 'pending' ? 'pause' : status === 'approved' ? 'check' : 'close' })),
        h('span', { class: 'wf-approval-title' }, '工具审批'),
      ]),
      h('div', { class: 'wf-approval-detail' }, detail),
      request.reason ? h('div', { class: 'wf-approval-reason' }, request.reason) : null,
      actions,
    ])
  }
}