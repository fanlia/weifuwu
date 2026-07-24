/**
 * DashScope Embedding 客户端
 *
 * 自实现 HTTP REST 调用，无 ai/@ai-sdk 依赖
 */

import type { EmbeddingParams, EmbeddingResponse } from './types.ts'

export interface DashScopeOptions {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
}

export class DashScopeClient {
  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(opts?: DashScopeOptions) {
    this.apiKey = opts?.apiKey ?? process.env.DASHSCOPE_API_KEY ?? ''
    this.baseUrl = opts?.baseUrl ?? process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    this.defaultModel = opts?.defaultModel ?? process.env.DASHSCOPE_EMBEDDING_MODEL ?? 'text-embedding-v4'

    if (!this.apiKey) {
      throw new Error('DashScope: DASHSCOPE_API_KEY 未设置。请设置环境变量或传入 apiKey')
    }
  }

  /**
   * 单文本嵌入
   */
  async embed(text: string): Promise<number[]> {
    const results = await this.embedMany([text])
    return results[0]
  }

  /**
   * 批量文本嵌入
   */
  async embedMany(texts: string[]): Promise<number[][]> {
    const body: EmbeddingParams = {
      model: this.defaultModel,
      input: texts,
    }

    // 设置 3 秒超时，防止不可达的 API 长时间阻塞
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/embeddings`, {
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
      throw new Error(`DashScope API error (${res.status}): ${errBody}`)
    }

    const data = (await res.json()) as EmbeddingResponse

    // 按 index 排序确保顺序一致
    data.data.sort((a, b) => a.index - b.index)
    return data.data.map(item => item.embedding)
  }
}
