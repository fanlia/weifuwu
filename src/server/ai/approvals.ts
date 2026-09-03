/**
 * weifuwu AI — HITL 审批注册表（协议 §4.5 公共实现——OpenAI transport 与 MemoryAi 共用）
 *
 * A4 三路收尾（超时/取消/批准）统一 finish——settled 恰好一次；
 * 取消/超时也删除条目（用后即焚扩展到取消路径：事后 approve 返回 false）。
 * 提取动机：waitApproval 状态机复杂（A4 修复实录——git log 可追溯）——
 * 复制两份 = 维护两份 bug（MemoryAi 新增时判负：不复制——共享单源）。
 */
import type { WfApprovalResponse } from './types.ts'

export type ApprovalEmitter = (name: string, data: unknown) => void

/** 默认审批超时：5 分钟（OpenAI 与内存实现一致） */
export const DEFAULT_APPROVAL_TIMEOUT = 5 * 60_000

export interface ApprovalHub {
  /** 响应挂起的审批（app 的 POST /approve 路由调用）——返回是否命中 */
  approve(response: WfApprovalResponse): boolean
  /** agent 循环挂起等待审批（emit approval_request——直到 approve/超时/取消） */
  waitApproval(
    req: { id: string; toolCallId: string; name: string; args: Record<string, unknown> },
    emit: ApprovalEmitter,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<WfApprovalResponse>
}

export function createApprovalHub(timeoutMs = DEFAULT_APPROVAL_TIMEOUT): ApprovalHub {
  const approvals = new Map<string, (resp: WfApprovalResponse) => void>()

  return {
    approve(response: WfApprovalResponse): boolean {
      const resolve = approvals.get(response.id)
      if (!resolve) return false
      approvals.delete(response.id)
      resolve(response)
      return true
    },

    async waitApproval(
      req: { id: string; toolCallId: string; name: string; args: Record<string, unknown> },
      emit: ApprovalEmitter,
      timeout = timeoutMs,
      signal?: AbortSignal,
    ): Promise<WfApprovalResponse> {
      const expiresAt = Date.now() + timeout
      emit('wf:approval_request', { ...req, expiresAt })
      return new Promise((resolve) => {
        let settled = false
        const finish = (resp: WfApprovalResponse) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve(resp)
        }
        const timer = setTimeout(() => {
          if (approvals.has(req.id)) approvals.delete(req.id)
          finish({ id: req.id, decision: 'rejected' }) // 超时 → 按拒绝处理（协议 §4.5）
        }, timeout)
        const onAbort = () => {
          if (approvals.has(req.id)) approvals.delete(req.id)
          finish({ id: req.id, decision: 'rejected' }) // 取消 → 拒绝（agent 循环随即退出）
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        approvals.set(req.id, (resp) => {
          if (approvals.has(req.id)) approvals.delete(req.id)
          finish(resp)
        })
      })
    },
  }
}
