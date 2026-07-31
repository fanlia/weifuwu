/**
 * AI 模块类型定义（精简版）— 仅 DeepSeek Chat Completions
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: MessageRole
  content: string
  /** DeepSeek thinking mode：前一步流的 reasoning_content 必须回传 */
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

export interface ChatResponse {
  id: string
  model: string
  choices: {
    index: number
    message: ChatMessage & { reasoning_content?: string }
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
    delta: { role?: string; content?: string; reasoning_content?: string; tool_calls?: ToolCall[] }
    finish_reason: 'stop' | 'length' | 'tool_calls' | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface StreamFinishResult {
  content: string
  reasoning_content?: string
  toolCalls: ToolCall[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: ChatChunk) => void
  onToolCall?: (toolCall: ToolCall) => void
  onToolResult?: (result: { name: string; result: string }) => void
  onFinish?: (result: StreamFinishResult) => void
}
