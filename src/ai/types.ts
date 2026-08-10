/**
 * weifuwu AI 协议共享类型 —— 与 design/ai-contract.md 规范一一对应
 *
 * 纯类型，零运行时成本。两端同源：
 *   - 后端：从 weifuwu 主包导入（src/index.ts re-export）
 *   - 前端：从 weifuwu/ui-dom 导入（src/ui-dom/index.ts re-export）
 *
 * 修改本文件 = 修改协议，需同步更新 design/ai-contract.md。
 */

// ── 事件（下行 SSE，event: wf:*）────────────────────────

export interface WfMessageStart {
  id: string
}

export interface WfToken {
  /** 增量文本，前端直接 append */
  text: string
}

export interface WfUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens?: number
}

export interface WfDone {
  content: string
  usage?: WfUsage
}

export type WfErrorCode =
  | 'auth_failed'
  | 'rate_limited'
  | 'context_length'
  | 'timeout'
  | 'provider_error'
  | 'invalid_request'
  | 'unsupported'
  | 'aborted'

export interface WfError {
  code: WfErrorCode
  message: string
}

export interface WfToolCall {
  /** 工具调用 id（provider 给 / 后端生成），聚合完成后才发 */
  id: string
  /** 工具名（app 定义的业务语义，协议不解释） */
  name: string
  /** 完整参数 */
  args: Record<string, unknown>
}

export interface WfToolResult {
  id: string
  ok: boolean
  output?: unknown
  /** ok:false 时：rejected（人工拒绝）/ timeout（审批超时）/ tool_error / app 自定义 */
  error?: { code: string; message: string }
}

export interface WfToolProgress {
  toolCallId: string
  step: number
  total: number
  message?: string
  status: 'running' | 'error' | 'done'
}

export interface WfStep {
  type: 'llm' | 'tool'
  content?: string
  toolCallId?: string
  name?: string
}

export interface WfApprovalRequest {
  id: string
  toolCallId: string
  name: string
  args: Record<string, unknown>
  reason?: string
  /** 审批超时；到期按 rejected 处理（error.code: 'timeout'） */
  expiresAt?: number
}

export type WfApprovalDecision = 'approved' | 'rejected' | 'modified'

/** 上行 POST 载荷（非 SSE 事件） */
export interface WfApprovalResponse {
  id: string
  decision: WfApprovalDecision
  /** 仅 modified：按修改后的参数执行 */
  modifiedArgs?: Record<string, unknown>
  /** 进 agent 上下文 */
  note?: string
}

/** 所有框架事件联合类型（前端 switch 收窄用） */
export type WfStreamEvent =
  | { name: 'wf:message_start'; data: WfMessageStart }
  | { name: 'wf:token'; data: WfToken }
  | { name: 'wf:usage'; data: WfUsage }
  | { name: 'wf:done'; data: WfDone }
  | { name: 'wf:error'; data: WfError }
  | { name: 'wf:tool_call'; data: WfToolCall }
  | { name: 'wf:tool_result'; data: WfToolResult }
  | { name: 'wf:tool_progress'; data: WfToolProgress }
  | { name: 'wf:step'; data: WfStep }
  | { name: 'wf:approval_request'; data: WfApprovalRequest }

// ── 对话消息（回传 provider 的形状，与 wf: 事件无关）────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: MessageRole
  content: string
  /** DeepSeek thinking mode：前一轮的 reasoning_content 必须回传 */
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  name?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatParams {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required'
  stop?: string[]
}
