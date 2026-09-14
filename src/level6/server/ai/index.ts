/**
 * weifuwu AI — 中间件工厂（provider 选择器）
 *
 * ```ts
 * import { ai, OpenAi, MemoryAi } from '../../index.ts'
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

import { OpenAi, type OpenAiOptions } from '../../../level5/server/ai/openai.ts'
import { MemoryAi, type MemoryAiOptions } from '../../../level5/server/ai/memory.ts'
import { assemble, type AiClientModule, type AiInjected } from '../../../level5/server/ai/assemble.ts'
import type { AiClientOptions as _AiClientOptions } from '../../../level5/server/ai/client.ts'

export type { Ai, AIInterface, ApprovalRequest } from '../../../level5/server/ai/contracts.ts'
export type { ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from '../../../level5/server/ai/contracts.ts'
export { OpenAi, type OpenAiOptions } from '../../../level5/server/ai/openai.ts'
export { MemoryAi, createMemoryAi, type MemoryAiOptions } from '../../../level5/server/ai/memory.ts'
export type { AiClientModule, AiInjected } from '../../../level5/server/ai/assemble.ts'

export type { AiEmbeddingOptions } from '../../../level5/server/ai/client.ts'
export type { AgentRunResult, AgentStep, AgentTool, AgentConfig, AgentRunner, ToolContext } from '../../../level5/server/ai/agent.ts'

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
} from '../../../level5/server/ai/types.ts'

export type { WfEmitter } from '../../../level5/server/ai/sse.ts'
export { AiError } from '../../../level5/server/ai/client.ts'
export type { AiClient, ChatResponse } from '../../../level5/server/ai/client.ts'
