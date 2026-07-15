declare module '../types.ts' {
  interface Context {
    /** AI / LLM integration. Injected by the `ai()` middleware. */
    ai: Ai
  }
}

// ═══════════════════════════════════════════════════════════════
// Ai context
// ═══════════════════════════════════════════════════════════════

export interface Ai {
  /**
   * Generate text (non-streaming). See `generateText` from the `ai` package.
   *
   * @example
   * const { text, toolCalls, steps } = await ctx.ai.generateText({
   *   prompt: 'What is the weather?',
   * })
   */
  generateText(opts: GenerateTextParams): Promise<AiGenerateTextResult>

  /** The language model instance. */
  model: unknown

  /** Default system prompt. */
  system: string | undefined
}

export type AiGenerateTextResult = Awaited<ReturnType<typeof import('ai').generateText<any, any, any>>>

// ═══════════════════════════════════════════════════════════════
// Options
// ═══════════════════════════════════════════════════════════════

export interface AiOptions {
  /**
   * Language model instance (from @ai-sdk/openai, @ai-sdk/anthropic, etc.).
   *
   * @example
   * import { openai } from '@ai-sdk/openai'
   * ai({ model: openai('gpt-4o') })
   */
  model: unknown

  /** System prompt added to every request. */
  system?: string

  /** Tools available for tool calling. */
  tools?: any

  /** Maximum agent steps for tool-calling loops (default: 1). */
  maxSteps?: number

  /** Default temperature (0–2). */
  temperature?: number

  /** Default max output tokens. */
  maxTokens?: number
}

// ═══════════════════════════════════════════════════════════════
// Parameter types
// ═══════════════════════════════════════════════════════════════

export interface GenerateTextParams {
  /** User prompt. */
  prompt: string
  /** System prompt override. */
  system?: string
  /** Chat history messages. */
  messages?: Array<{ role: string; content: string } & Record<string, any>>
  /** Override temperature. */
  temperature?: number
  /** Override max tokens. */
  maxTokens?: number
  /** Override max steps. */
  maxSteps?: number
}
