/**
 * weifuwu AI — 中间件工厂（provider 选择器）
 *
 * ```ts
 * import { ai, OpenAi, MemoryAi } from 'weifuwu'
 *
 * const a = ai()                          // 选择器：默认 OpenAi（DEEPSEEK_* env）
 * const b = new OpenAi({ apiKey })        // 正门构造（OpenAI 兼容——deepseek/dashscope/mock）
 * const c = new MemoryAi({ onChat })      // 内存确定性（测试/离线）
 * app.use(a)                              // → ctx.ai.chat / ctx.ai.stream / ...
 * ```
 *
 * provider 与模块组装分家（参考 postgres 契约/工厂/引擎分层）：
 *   contracts.ts（AIInterface 契约）/ client+multimodal（OpenAI provider 引擎）/
 *   memory.ts（MemoryAi）/ openai.ts + assemble.ts（模块构造）/ 本文件（选择器）
 */

import { OpenAi, type OpenAiOptions } from './openai.ts'
import { MemoryAi, type MemoryAiOptions } from './memory.ts'
import { assemble, type AiClientModule, type AiInjected } from './assemble.ts'
import type { AiClientOptions as _AiClientOptions } from './client.ts'

export type { Ai, AIInterface, ApprovalRequest } from './contracts.ts'
export type { ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from './contracts.ts'
export { OpenAi, type OpenAiOptions } from './openai.ts'
export { MemoryAi, createMemoryAi, type MemoryAiOptions } from './memory.ts'
export type { AiClientModule, AiInjected } from './assemble.ts'

export type AiOptions = OpenAiOptions & {
  /** provider 选择（默认 openai = OpenAi；memory = MemoryAi——测试/离线） */
  provider?: 'openai' | 'memory'
  /** memory provider 选项（onChat 决策注入等） */
  memory?: MemoryAiOptions
}

export type { AiEmbeddingOptions } from './client.ts'
export type { AgentRunResult, AgentStep, AgentTool, AgentConfig, AgentRunner, ToolContext } from './agent.ts'

export function ai(options?: AiOptions): AiClientModule {
  // provider 选择：显式 > env > 默认 openai（向后兼容——无 key 仍 throw）
  const provider = options?.provider ?? process.env.AI_PROVIDER ?? 'openai'
  if (provider === 'memory') {
    return MemoryAi(options?.memory)
  }
  return OpenAi(options)
}

// ── 协议类型 re-export（类型流：weifuwu 主包即可见）───────

export type {
  WfStreamEvent,
  WfMessageStart,
  WfToken,
  WfUsage,
  WfDone,
  WfError,
  WfErrorCode,
  WfToolCall,
  WfToolResult,
  WfToolProgress,
  WfStep,
  WfApprovalRequest,
  WfApprovalResponse,
  WfApprovalDecision,
  ChatMessage,
  ChatParams,
  MessageRole,
  ToolCall,
  ToolDefinition,
} from './types.ts'

export type { WfEmitter } from './sse.ts'
export { AiError } from './client.ts'
export type { AiClient, ChatResponse } from './client.ts'
