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
    this.defaultModel = opts?.defaultModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    let res
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    let res
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`DeepSeek API error (${res.status}): ${errBody}`)
    }

    if (!res.body) throw new Error('DeepSeek: 响应体为空')

    let fullContent = ''
    let reasoningContent = ''
    const toolCalls: import('./types.ts').ToolCall[] = []
    let lastUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined

    for await (const chunk of parseSSEStream(res.body)) {
      // await onChunk 确保 chunk 处理完成后再处理下一个或触发 onFinish
      await params.onChunk(chunk)

      // 提取最后一个 chunk 的 usage（DeepSeek 在流结束的 chunk 中返回）
      if (chunk.usage) {
        lastUsage = chunk.usage
      }

      for (const choice of chunk.choices) {
        if (choice.delta.content) {
          fullContent += choice.delta.content
        }
        // DeepSeek thinking mode：捕获 reasoning_content，后续请求需回传
        if (choice.delta.reasoning_content) {
          reasoningContent += choice.delta.reasoning_content
        }
        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            // DeepSeek 流式时 tool_calls 在后续 chunk 中可能没有 id
            // 无 id 时追加到最后一个 tool call 的参数末尾
            let existing: typeof toolCalls[0] | undefined
            if (tc.id) {
              existing = toolCalls.find(t => t.id === tc.id)
            }
            if (!existing && toolCalls.length > 0) {
              existing = toolCalls[toolCalls.length - 1]
            }
            if (existing) {
              existing.function.arguments += tc.function?.arguments ?? ''
            } else {
              const newTc: typeof toolCalls[0] = {
                id: tc.id ?? '',
                type: 'function',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              }
              toolCalls.push(newTc)
              // 只在首次创建工具调用时通知前端
              // 后续参数追加不应重复触发 onToolCall
              params.onToolCall?.(newTc)
            }
          }
        }
      }
    }

    params.onFinish?.({ content: fullContent, reasoning_content: reasoningContent || undefined, toolCalls, usage: lastUsage })
  }
}
