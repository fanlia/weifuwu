/**
 * weifuwu AI — OpenAi provider 构造（new OpenAi() / OpenAi() ——同 ai() 返回模块）
 *
 * 参考 openai 兼容实现（client.ts——Chat/Agent 引擎）+ 多模态（multimodal.ts）——
 * env 读取（DEEPSEEK_*）与模块组装（assemble）在这里汇合：
 *   new OpenAi(opts) → AiClientModule（app.use 注入 ctx.ai——全能力）
 * ai() 工厂的默认分支 = OpenAi（provider 选择器——正门构造对称 MemoryAi）。
 */
import { createAiClient, type AiClientOptions } from './client.ts'
import { assemble, type AiClientModule } from './assemble.ts'

/** OpenAi 构造选项（同 AiClientOptions——见 client.ts） */
export type OpenAiOptions = AiClientOptions

export interface OpenAi {
  new (options?: OpenAiOptions): OpenAi
}

export function OpenAi(options?: OpenAiOptions): AiClientModule {
  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? ''
  const baseUrl = options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'
  const defaultModel = options?.defaultModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

  if (!apiKey) {
    throw new Error('ai: DEEPSEEK_API_KEY 未设置。请设置环境变量或传入 apiKey（或 provider=memory 用内存实现）')
  }

  const client = createAiClient({
    apiKey,
    baseUrl,
    defaultModel,
    embedding: options?.embedding,
    image: options?.image,
    video: options?.video,
    // W6：首 token 超时 + 流式可重试错误重试——直接透传
    firstTokenTimeoutMs: options?.firstTokenTimeoutMs,
    streamRetries: options?.streamRetries,
  })

  return assemble(client)
}
