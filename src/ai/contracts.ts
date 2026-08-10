/**
 * weifuwu/ai — AI 契约层（接口与实现分离）
 *
 * 消费方（ctx.ai / 业务模块）只依赖 Ai 接口，
 * 自研引擎（src/ai/index.ts 中间件工厂 + client.ts HTTP 客户端 + agent.ts 工具循环）实现它。
 *
 * 配置优先级：显式参数 > env > 默认值。
 *   apiKey:      DEEPSEEK_API_KEY
 *   baseUrl:     DEEPSEEK_BASE_URL      → 'https://api.deepseek.com/v1'
 *   defaultModel: DEEPSEEK_MODEL        → 'deepseek-v4-flash'
 *
 * 裁剪声明（诚实裁剪——AGENTS.md CS-05）：
 *   ✅ 对话/流式/SSE 协议（§1）/ agent 工具循环 + HITL 审批 / embedding（可选 provider）
 *   ❌ 附件、多模态、函数调用中间态缓存（agent 状态由调用方持有）
 */
import type { ChatParams, WfApprovalResponse } from './types.ts'
import type { ChatResponse } from './client.ts'
import type { WfEmitter } from './sse.ts'
import type { AgentConfig, AgentRunner } from './agent.ts'

/** agent 循环挂起等待审批的请求（协议 §4.5） */
export interface ApprovalRequest {
  id: string
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

/**
 * AI 客户端（ctx.ai）：对话 / 流式 / SSE / agent / HITL / embedding。
 * 模块即中间件（app.use(a) 注入 ctx.ai），worker/后台场景同一实例直接调用。
 */
export interface Ai {
  /** 非流式对话（worker/后台场景） */
  chat(params: ChatParams, options?: { signal?: AbortSignal }): Promise<ChatResponse>
  /** 流式对话 → SSE Response（协议 §1.1），路由直接 return */
  stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response
  /** 低层：app 完全控制事件序列（自定义 x:* 事件、HITL 等） */
  sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response
  /** 响应一个挂起的 HITL 审批（协议 §4.5，app 的 POST /approve 路由调用） */
  approve(response: WfApprovalResponse): boolean
  /** 内部：agent 循环挂起等待审批 */
  waitApproval(req: ApprovalRequest, emit: WfEmitter, timeoutMs?: number): Promise<WfApprovalResponse>
  /** 单文本嵌入（知识库/语义检索；需 ai({ embedding }) 配置，未配抛 AiError） */
  embed(text: string): Promise<number[]>
  /** 批量文本嵌入（按输入顺序返回） */
  embedMany(texts: string[]): Promise<number[][]>
  /** agent 引擎（工具循环 + HITL 审批） */
  agent(config: AgentConfig): AgentRunner
  close(): Promise<void>
}
