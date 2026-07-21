/**
 * DeepSeek Chat Completions 客户端
 *
 * 自实现 HTTP REST 调用，无 ai/@ai-sdk 依赖
 */

import type { ChatParams, ChatResponse, ChatChunk, ChatStreamCallbacks } from './types.ts'
import { parseSSEStream } from './stream.ts'

export interface DeepSeekOptions {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
}

export class DeepSeekClient {
  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(opts?: DeepSeekOptions) {
    this.apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''
    this.baseUrl = opts?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'
    this.defaultModel = opts?.defaultModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

    if (!this.apiKey) {
      throw new Error('DeepSeek: DEEPSEEK_API_KEY 未设置。请设置环境变量或传入 apiKey')
    }
  }

  /**
   * 非流式 Chat Completion 调用
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    const body = {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      stream: false,
      tools: params.tools?.length ? params.tools : undefined,
      tool_choice: params.tool_choice,
      stop: params.stop,
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`DeepSeek API error (${res.status}): ${errBody}`)
    }

    return res.json() as Promise<ChatResponse>
  }

  /**
   * 流式 Chat Completion 调用
   */
  async chatStream(
    params: ChatParams & ChatStreamCallbacks,
  ): Promise<void> {
    const body = {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      stream: true,
      tools: params.tools?.length ? params.tools : undefined,
      tool_choice: params.tool_choice,
      stop: params.stop,
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`DeepSeek API error (${res.status}): ${errBody}`)
    }

    if (!res.body) throw new Error('DeepSeek: 响应体为空')

    let fullContent = ''
    const toolCalls: import('./types.ts').ToolCall[] = []

    for await (const chunk of parseSSEStream(res.body)) {
      params.onChunk(chunk)

      for (const choice of chunk.choices) {
        if (choice.delta.content) {
          fullContent += choice.delta.content
        }
        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const existing = toolCalls.find(t => t.id === tc.id)
            if (existing) {
              existing.function.arguments += tc.function?.arguments ?? ''
            } else {
              toolCalls.push({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              })
            }
            params.onToolCall?.(toolCalls[toolCalls.length - 1])
          }
        }
      }
    }

    params.onFinish?.({ content: fullContent, toolCalls })
  }
}
