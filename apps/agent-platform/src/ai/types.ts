/**
 * AI 模块类型定义 — DeepSeek LLM + DashScope Embedding
 */

// ── Chat Completions (DeepSeek) ─────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: MessageRole
  content: string
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
  /** 停止字符 */
  stop?: string[]
}

export interface ChatResponse {
  id: string
  model: string
  choices: {
    index: number
    message: ChatMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ChatChunk {
  id: string
  model: string
  choices: {
    index: number
    delta: { role?: string; content?: string; tool_calls?: ToolCall[] }
    finish_reason: 'stop' | 'length' | 'tool_calls' | null
  }[]
}

// ── Streaming callbacks ─────────────────────────────────────

export interface ChatStreamCallbacks {
  onChunk: (chunk: ChatChunk) => void
  onToolCall?: (toolCall: ToolCall) => void
  onFinish?: (result: { content: string; toolCalls: ToolCall[] }) => void
}

// ── Embedding (DashScope) ───────────────────────────────────

export interface EmbeddingParams {
  model?: string
  input: string | string[]
}

export interface EmbeddingResponse {
  model: string
  data: { index: number; embedding: number[] }[]
  usage: { prompt_tokens: number; total_tokens: number }
}

// ── Agent Tool Loop ─────────────────────────────────────────

export interface AgentConfig {
  model?: string
  systemPrompt: string
  tools: ToolDefinition[]
  maxSteps?: number
  /** 默认 false。true 时，onStepEnd 会阻塞等待人工确认 */
  humanInTheLoop?: boolean
}

export interface AgentRunResult {
  content: string
  messages: ChatMessage[]
  steps: AgentStep[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface AgentStep {
  type: 'llm' | 'tool_call' | 'tool_result'
  content?: string
  toolCall?: ToolCall
  toolResult?: string
}

export interface OnStepEndParams {
  messages: ChatMessage[]
  step: AgentStep
  approve: () => void
  reject: (reason?: string) => void
}

// ── AiClient 接口 ──────────────────────────────────────────

export interface AiClient {
  /** LLM 对话（DeepSeek） */
  chat(params: ChatParams): Promise<ChatResponse>
  /** 流式 LLM 对话 */
  chatStream(params: ChatParams & ChatStreamCallbacks): Promise<void>

  /** Agent Tool Loop */
  agent(config: AgentConfig): {
    run(messages: ChatMessage[]): Promise<AgentRunResult>
    stream(messages: ChatMessage[], callbacks: ChatStreamCallbacks): Promise<AgentRunResult>
  }

  /** Embedding（DashScope） */
  embed(text: string): Promise<number[]>
  embedMany(texts: string[]): Promise<number[][]>
}
