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
 * 裁剪声明（诚实裁剪——CS-05）：
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
 * AI 客户端（ctx.ai）：对话 / 流式 / SSE / agent / HITL / embedding / 多模态。
 * 模块即中间件（app.use(a) 注入 ctx.ai），worker/后台场景同一实例直接调用。
 * 参考 PostgresInterface 分层（src/server/postgres/types.ts）：接口与实现分离——
 * 实现见 client.ts（OpenAI 兼容 provider）/ memory.ts（MemoryAi——契约直实现）。
 */
export interface AIInterface {
  /** 非流式对话（worker/后台场景） */
  chat(params: ChatParams, options?: { signal?: AbortSignal }): Promise<ChatResponse>
  /** 流式对话 → SSE Response（协议 §1.1），路由直接 return */
  stream(params: ChatParams, options?: { signal?: AbortSignal; traceId?: string }): Response
  /** 低层：app 完全控制事件序列（自定义 x:* 事件、HITL 等） */
  sse(run: (emit: WfEmitter) => Promise<void> | void, options?: { signal?: AbortSignal }): Response
  /** 响应一个挂起的 HITL 审批（协议 §4.5，app 的 POST /approve 路由调用） */
  approve(response: WfApprovalResponse): boolean
  /** 内部：agent 循环挂起等待审批（A4：signal 取消也收尾——挂起不阻塞取消） */
  waitApproval(req: ApprovalRequest, emit: WfEmitter, timeoutMs?: number, signal?: AbortSignal): Promise<WfApprovalResponse>
  /** 单文本嵌入（知识库/语义检索；需 ai({ embedding }) 配置，未配抛 AiError） */
  embed(text: string): Promise<number[]>
  /** 批量文本嵌入（按输入顺序返回） */
  embedMany(texts: string[]): Promise<number[][]>
  /** agent 引擎（工具循环 + HITL 审批） */
  agent(config: AgentConfig): AgentRunner
  /** 文生图（同步——返回图片地址或 data URL——保存/入库由调用方编排） */
  generateImage(req: ImageGenRequest, options?: { signal?: AbortSignal }): Promise<ImageGenResult>
  /** 文生视频（异步提交——返回任务 ID——provider 状态由 videoStatus 查询） */
  createVideoTask(req: VideoGenRequest, options?: { signal?: AbortSignal }): Promise<{ taskId: string }>
  /** 视频任务状态（编排层轮询——完成返回 url） */
  videoStatus(taskId: string, options?: { signal?: AbortSignal }): Promise<VideoGenStatus>
  close(): Promise<void>
}

/** 兼容别名（2027-10 重构：Ai → AIInterface 正名——旧名保留防消费端破坏） */
export type Ai = AIInterface

// ── 多模态请求/响应契约（provider 无关——OpenAI 兼容与 MemoryAi 同一形状） ──

export interface ImageGenRequest {
  prompt: string
  /** "宽*高"——默认 provider 决定（OpenAI 兼容：1024*1024；MemoryAi：忽略） */
  size?: string
  /** 模型名（默认 provider 决定） */
  model?: string
}

export interface ImageGenResult {
  /** 图片地址（provider 返回——HTTP URL） */
  url?: string
  /** base64 data URL（MemoryAi 占位图——1×1 透明 PNG） */
  dataUrl?: string
  /** MIME 类型（默认 image/png） */
  mime?: string
}

export interface VideoGenRequest {
  prompt: string
  /** 时长秒（3-15——默认 provider 决定） */
  duration?: number
  /** 宽高比（16:9/9:16/1:1……） */
  ratio?: string
  /** 分辨率（480P/720P/1080P） */
  resolution?: string
  /** 模型名 */
  model?: string
}

export type VideoGenStatus =
  | { status: 'pending' | 'running'; url?: undefined; error?: undefined }
  | { status: 'done'; url: string; error?: undefined }
  | { status: 'failed'; error: string; url?: undefined }

declare module '../../server/types.ts' {
  interface Context {
    /** 注入模块本身（含 agent / approve）——worker 场景直接 a.chat() */
    ai?: AIInterface
  }
}
