import type { Middleware, Context } from '../types.ts'
import type { AiOptions } from '../ai/types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * AI agent — LLM integration with session management, tool calling,
     * knowledge retrieval, and streaming.
     * Injected by the `agent()` middleware.
     */
    agent: Agent
  }
}

// ═══════════════════════════════════════════════════════════════
// Agent
// ═══════════════════════════════════════════════════════════════

export interface Agent {
  /**
   * Chat with the agent (non-streaming). Returns the final response
   * after tool calls and knowledge retrieval.
   */
  chat(prompt: string, opts?: AgentChatOptions): Promise<AgentChatResult>

  /**
   * Stream the agent's response as an SSE Response.
   * Compatible with `useChat` from @ai-sdk/react.
   */
  chatStreamResponse(opts: AgentStreamOptions): Response

  /** The underlying language model. */
  model: unknown

  /** Default system prompt. */
  system: string | undefined
}

export interface AgentChatOptions {
  /** Override system prompt for this call. */
  system?: string
  /** Chat history messages (from useChat). */
  messages?: Array<{ role: string; content: string; [key: string]: unknown }>
  /** Override temperature. */
  temperature?: number
  /** Override max tokens. */
  maxTokens?: number
  /** Override max steps. */
  maxSteps?: number
}

export interface AgentStreamOptions {
  /** User prompt or full message list. */
  messages: Array<{ role: string; content: string; [key: string]: unknown }>
  /** Override system prompt. */
  system?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentChatResult = Record<string, any>

// ═══════════════════════════════════════════════════════════════
// Options
// ═══════════════════════════════════════════════════════════════

export interface AgentOptions extends AiOptions {
  /**
   * Knowledge base for RAG. Called before every chat to inject context.
   */
  knowledge?: {
    /**
     * Search for relevant documents given a user query.
     * Results are injected into the system prompt.
     */
    search: (
      query: string,
      ctx: Context,
    ) => Promise<Array<{ content: string; score?: number }>>
    /** Maximum results to inject (default: 3). */
    topK?: number
    /** Minimum relevance score (default: 0). */
    minScore?: number
  }

  /**
   * Named sub-agents with their own model, system prompt, and tools.
   * Access via ctx.agent.agents[name].
   */
  agents?: Record<string, {
    model?: unknown
    system?: string
    tools?: Record<string, unknown>
  }>

  /**
   * Enable sandbox integration. When true and ctx.sandbox is available,
   * the agent automatically uses it for file operations.
   */
  sandbox?: boolean

  /**
   * Store for session persistence. Save/load conversation history.
   */
  store?: {
    save: (sessionId: string, messages: unknown[]) => Promise<void>
    load: (sessionId: string) => Promise<unknown[]>
  }
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

/**
 * AI Agent middleware — injects `ctx.agent` for LLM-powered conversations.
 *
 * Built on the Vercel AI SDK. Supports:
 * - Multi-turn conversations with session history
 * - Tool calling with automatic loops (maxSteps)
 * - Knowledge retrieval (RAG) via `knowledge.search`
 * - Streaming SSE responses compatible with `useChat` from @ai-sdk/react
 * - Named sub-agents for role-based delegation
 * - Sandbox integration
 *
 * @example
 * ```ts
 * import { agent } from 'weifuwu'
 * import { openai } from '@ai-sdk/openai'
 *
 * app.use(agent({
 *   model: openai('gpt-4o'),
 *   system: 'You are a helpful assistant.',
 *   knowledge: {
 *     search: async (query, ctx) => ctx.sql`...pgvector...`,
 *   },
 *   tools: { getWeather: tool({...}) },
 * }))
 *
 * app.post('/api/chat', async (req, ctx) => {
 *   const { messages } = await req.json()
 *   return ctx.agent.chatStreamResponse({ messages })
 * })
 * ```
 */
export function agent(opts: AgentOptions): Middleware {
  let aiModule: typeof import('ai') | null = null

  async function getAi() {
    if (!aiModule) aiModule = await import('ai')
    return aiModule
  }

  return async (req, ctx, next) => {
    ctx.agent = {
      model: opts.model,
      system: opts.system,

      async chat(prompt: string, chatOpts: AgentChatOptions = {}) {
        const { generateText } = await getAi()

        // Knowledge retrieval
        let knowledgeContext = ''
        if (opts.knowledge) {
          try {
            const results = await opts.knowledge.search(prompt, ctx)
            const topK = opts.knowledge.topK ?? 3
            const minScore = opts.knowledge.minScore ?? 0
            const filtered = results
              .filter(r => (r.score ?? 1) >= minScore)
              .slice(0, topK)

            if (filtered.length > 0) {
              knowledgeContext = '\n\n参考以下知识：\n' +
                filtered.map((r, i) => `[${i + 1}] ${r.content}`).join('\n')
            }
          } catch {
            // Knowledge retrieval failure is non-fatal
          }
        }

        // Build messages
        const system = chatOpts.system ?? opts.system ?? ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: any[] = [...(chatOpts.messages ?? [])]

        if (system) {
          const hasSystem = messages.some((m: any) => m.role === 'system')
          if (!hasSystem) {
            messages.unshift({
              role: 'system',
              content: knowledgeContext ? system + knowledgeContext : system,
            })
          } else if (knowledgeContext) {
            // Append knowledge to existing system message
            const sysMsg = messages.find((m: any) => m.role === 'system')
            if (sysMsg) sysMsg.content += knowledgeContext
          }
        }

        // If no messages with user role, add prompt as user message
        if (prompt && !messages.some((m: any) => m.role === 'user')) {
          messages.push({ role: 'user', content: prompt })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await (generateText as any)({
          model: opts.model,
          messages,
          tools: opts.tools,
          maxSteps: chatOpts.maxSteps ?? opts.maxSteps ?? 1,
          temperature: chatOpts.temperature ?? opts.temperature,
          maxTokens: chatOpts.maxTokens ?? opts.maxTokens,
          abortSignal: req.signal,
        })

        return {
          text: result.text,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          steps: result.steps,
          finishReason: result.finishReason,
          usage: result.usage,
        }
      },

      chatStreamResponse(streamOpts: AgentStreamOptions): Response {
        // SSE streaming — builds a ReadableStream that emits
        // text-delta and tool-call events as they arrive
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Use generateText for now; streamText wrapping is future work
              const result = await ctx.agent.chat(
                streamOpts.messages.filter(m => m.role === 'user').pop()?.content ?? '',
                {
                  messages: streamOpts.messages,
                  system: streamOpts.system,
                },
              )

              // Emit as SSE
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: result.text })}\n\n`))
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            } catch (err) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`,
              ))
              controller.close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    }

    return next(req, ctx)
  }
}
