/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context, Middleware } from '../types.ts'
import { createOpenAI } from '@ai-sdk/openai'
import {
  embed as aiEmbed,
  embedMany as aiEmbedMany,
  generateText as aiGenerateText,
  streamText as aiStreamText,
  type LanguageModel,
  type EmbeddingModel,
} from 'ai'

// Augment Context with ai property
declare module '../types.ts' {
  interface Context {
    ai: AIProvider
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface AIProviderInjected {
  ai: AIProvider
}

export interface AIProviderOptions {
  /** API base URL (default: OPENAI_BASE_URL env or http://localhost:11434/v1). */
  baseURL?: string
  /** API key (default: OPENAI_API_KEY env or 'ollama'). */
  apiKey?: string
  /** Chat model name (default: OPENAI_MODEL env or 'qwen3:0.6b'). */
  model?: string
  /** Embedding model name (default: OPENAI_EMBEDDING_MODEL env or 'qwen3-embedding:0.6b'). */
  embeddingModel?: string
  /** Vector dimension (default: EMBEDDING_DIMENSION env or 1024). */
  embeddingDimension?: number
}

export interface AIProvider {
  /** Get the language model. Caches by default; pass a name to override. */
  model(name?: string): LanguageModel
  /** Get the embedding model. Caches by default; pass a name to override. */
  embeddingModel(name?: string): EmbeddingModel
  /** Embed a single text string into a vector. */
  embed(text: string): Promise<number[]>
  /** Embed multiple text strings in batch. */
  embedMany(texts: string[]): Promise<number[][]>
  /** The configured vector dimension. */
  readonly dimension: number

  /**
   * Generate text using the configured model.
   * All options are passed through to the AI SDK's `generateText`, with `model` auto-injected.
   */
  generateText(
    params: Omit<Parameters<typeof aiGenerateText>[0], 'model'>,
  ): ReturnType<typeof aiGenerateText>
  /**
   * Stream text using the configured model.
   * All options are passed through to the AI SDK's `streamText`, with `model` auto-injected.
   */
  streamText(
    params: Omit<Parameters<typeof aiStreamText>[0], 'model'>,
  ): ReturnType<typeof aiStreamText>
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function aiProvider(
  options?: AIProviderOptions,
): Middleware<Context, Context & AIProviderInjected> & AIProvider {
  const baseURL = options?.baseURL ?? process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1'
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? 'ollama'
  const modelName = options?.model ?? process.env.OPENAI_MODEL ?? 'qwen3:0.6b'
  const embedModelName =
    options?.embeddingModel ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'qwen3-embedding:0.6b'
  const dimension =
    options?.embeddingDimension ?? parseInt(process.env.EMBEDDING_DIMENSION || '1024', 10)

  const client = createOpenAI({ baseURL, apiKey })

  let _model: LanguageModel | undefined
  let _embedModel: EmbeddingModel | undefined

  const provider: AIProvider = {
    get dimension() {
      return dimension
    },

    model(name?: string): LanguageModel {
      const m = name ?? modelName
      if (!_model) _model = client(m)
      return _model
    },

    embeddingModel(name?: string): EmbeddingModel {
      const m = name ?? embedModelName
      if (!_embedModel) _embedModel = client.embedding(m)
      return _embedModel
    },

    async embed(text: string): Promise<number[]> {
      const result = await aiEmbed({ model: this.embeddingModel(), value: text })
      return result.embedding
    },

    async embedMany(texts: string[]): Promise<number[][]> {
      const result = await aiEmbedMany({ model: this.embeddingModel(), values: texts })
      return result.embeddings
    },

    generateText(params: Omit<Parameters<typeof aiGenerateText>[0], 'model'>) {
      return aiGenerateText({ ...params, model: this.model() } as any)
    },

    streamText(params: Omit<Parameters<typeof aiStreamText>[0], 'model'>) {
      return aiStreamText({ ...params, model: this.model() } as any)
    },
  }

  const mw: Middleware<Context, Context & AIProviderInjected> = async (req, ctx, next) => {
    ;(ctx as Context & AIProviderInjected).ai = provider
    return next(req, ctx as Context & AIProviderInjected)
  }

  return Object.assign(mw, provider) as Middleware<Context, Context & AIProviderInjected> &
    AIProvider
}
