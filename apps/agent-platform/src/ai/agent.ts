/**
 * Tool Loop 引擎 — 自实现 Agent 循环
 *
 * 支持：
 * - 多轮 tool calling
 * - 流式输出
 * - Human-in-the-Loop（onStepEnd 中等待审批）
 */

import type {
  ChatMessage,
  ToolCall,
  AgentConfig,
  AgentRunResult,
  AgentStep,
  ChatStreamCallbacks,
  AiClient,
} from './types.ts'

export function createAgent(
  client: AiClient,
  config: AgentConfig,
) {
  const maxSteps = config.maxSteps ?? 10

  /**
   * 非流式运行 Agent
   */
  async function run(messages: ChatMessage[]): Promise<AgentRunResult> {
    const steps: AgentStep[] = []
    const allMessages: ChatMessage[] = [
      { role: 'system', content: config.systemPrompt },
      ...messages,
    ]

    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    for (let step = 0; step < maxSteps; step++) {
      // 调用 LLM
      const response = await client.chat({
        model: config.model,
        messages: allMessages,
        tools: config.tools,
      })

      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens
        totalUsage.completion_tokens += response.usage.completion_tokens
        totalUsage.total_tokens += response.usage.total_tokens
      }

      const choice = response.choices[0]
      const msg = choice.message

      // 记录 LLM step
      steps.push({
        type: 'llm',
        content: msg.content,
      })

      allMessages.push(msg)

      // 没有 tool_calls → 完成
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          content: msg.content ?? '',
          messages: allMessages,
          steps,
          usage: totalUsage,
        }
      }

      // 执行每个 tool call
      for (const toolCall of msg.tool_calls) {
        steps.push({
          type: 'tool_call',
          toolCall,
        })

        // 查找并执行 tool
        let toolResult: string
        try {
          toolResult = await executeToolCall(toolCall, config.tools)
        } catch (err) {
          toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
        }

        steps.push({
          type: 'tool_result',
          toolResult,
        })

        allMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        })

        // Human-in-the-Loop: onStepEnd 等待审批
        if (config.humanInTheLoop) {
          await new Promise<void>((resolve) => {
            // 外部通过 agent.run() 的调用方提供的 approve/reject 机制
            // 实际场景由 WS 推送审批请求，管理员确认后调用 resolve()
            // 这里通过同步方式等待 — 具体集成在 agent-runner.ts 中实现
            const onStepEnd = (config as any).__onStepEnd
            if (onStepEnd) {
              onStepEnd({
                messages: allMessages,
                step: steps[steps.length - 2], // tool_call step
                approve: () => resolve(),
                reject: (reason?: string) => {
                  if (reason) {
                    allMessages.push({
                      role: 'tool',
                      content: `Human rejected: ${reason}`,
                      tool_call_id: toolCall.id,
                    })
                  }
                  resolve()
                },
              })
            } else {
              resolve() // 没有 onStepEnd，自动继续
            }
          })
        }
      }
    }

    // 达到最大步数，返回当前结果
    return {
      content: steps.filter(s => s.type === 'llm').map(s => s.content).filter(Boolean).join('\n'),
      messages: allMessages,
      steps,
      usage: totalUsage,
    }
  }

  /**
   * 流式运行 Agent
   */
  async function stream(
    messages: ChatMessage[],
    callbacks: ChatStreamCallbacks,
  ): Promise<AgentRunResult> {
    const steps: AgentStep[] = []
    const allMessages: ChatMessage[] = [
      { role: 'system', content: config.systemPrompt },
      ...messages,
    ]

    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    for (let step = 0; step < maxSteps; step++) {
      let fullContent = ''
      const toolCalls: ToolCall[] = []

      await client.chatStream({
        model: config.model,
        messages: allMessages,
        tools: config.tools,
        onChunk: (chunk) => {
          callbacks.onChunk(chunk)
          for (const choice of chunk.choices) {
            if (choice.delta.content) fullContent += choice.delta.content
            if (choice.delta.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                let existing = toolCalls.find(t => t.id === tc.id)
                if (existing) {
                  existing.function.arguments += tc.function?.arguments ?? ''
                } else {
                  existing = {
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.function?.name ?? '',
                      arguments: tc.function?.arguments ?? '',
                    },
                  }
                  toolCalls.push(existing)
                }
              }
            }
          }
        },
        onToolCall: callbacks.onToolCall,
        onFinish: callbacks.onFinish,
      })

      // 记录 LLM step
      steps.push({
        type: 'llm',
        content: fullContent,
      })

      const msg: ChatMessage = {
        role: 'assistant',
        content: fullContent,
      }
      if (toolCalls.length > 0) msg.tool_calls = toolCalls
      allMessages.push(msg)

      // 没有 tool_calls → 完成
      if (toolCalls.length === 0) {
        return {
          content: fullContent,
          messages: allMessages,
          steps,
          usage: totalUsage,
        }
      }

      // 执行每个 tool call
      for (const toolCall of toolCalls) {
        steps.push({ type: 'tool_call', toolCall })

        let toolResult: string
        try {
          toolResult = await executeToolCall(toolCall, config.tools)
        } catch (err) {
          toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`
        }

        steps.push({ type: 'tool_result', toolResult })

        allMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        })

        if (config.humanInTheLoop) {
          await new Promise<void>((resolve) => {
            const onStepEnd = (config as any).__onStepEnd
            if (onStepEnd) {
              onStepEnd({
                messages: allMessages,
                step: steps[steps.length - 2],
                approve: () => resolve(),
                reject: (reason?: string) => {
                  if (reason) {
                    allMessages.push({
                      role: 'tool',
                      content: `Human rejected: ${reason}`,
                      tool_call_id: toolCall.id,
                    })
                  }
                  resolve()
                },
              })
            } else {
              resolve()
            }
          })
        }
      }
    }

    return {
      content: steps.filter(s => s.type === 'llm').map(s => s.content).filter(Boolean).join('\n'),
      messages: allMessages,
      steps,
      usage: totalUsage,
    }
  }

  return { run, stream }
}

/**
 * 执行单个 tool call
 * 查找本地注册的 tool 并调用其 handler
 */
async function executeToolCall(
  toolCall: ToolCall,
  tools: import('./types.ts').ToolDefinition[],
): Promise<string> {
  const { name, arguments: argsStr } = toolCall.function
  const toolDef = tools.find(t => t.function.name === name)

  if (!toolDef) {
    return `Error: tool "${name}" not found`
  }

  // 查找工具 handler — 通过工具注册表
  const handler = toolHandlers.get(name)
  if (!handler) {
    return `Error: tool handler for "${name}" not registered`
  }

  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsStr)
  } catch {
    args = {}
  }

  try {
    const result = await handler(args)
    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch (err) {
    return `Error executing tool "${name}": ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * 工具注册表 — 全局的 tool name → handler 映射
 */
const toolHandlers = new Map<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>()

/**
 * 注册一个 tool handler
 */
export function registerTool(
  name: string,
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>,
): void {
  toolHandlers.set(name, handler)
}

/**
 * 批量注册 tool handlers
 */
export function registerTools(
  tools: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>,
): void {
  for (const [name, handler] of Object.entries(tools)) {
    toolHandlers.set(name, handler)
  }
}
