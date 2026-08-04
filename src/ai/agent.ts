/**
 * weifuwu AI — agent 工具循环引擎（协议 §5，agent 扩展实现）
 *
 * 循环：LLM 流式（emit wf:token）→ tool_calls → 执行工具 → 结果回喂 → 重复
 *
 * - 工具执行期间可 emit（wf:tool_progress / x:* 自定义）与接收 signal（取消）
 * - HITL 审批（协议 §4.5）：humanInTheLoop 时每个工具执行前挂起等待
 *   ctx.ai.approve() 响应（或超时按拒绝处理）——拒绝 ≠ 终止，agent 换方案
 * - 事件序列：message_start → (step:llm → token* → tool_call → step:tool
 *   → [approval_request → approve] → tool_result)* → usage → done
 *
 * 子 agent = 工具：委派工具的 run 内部调另一个 createAgent().run()（异步），
 * 其最终输出即 tool_result——多 agent 沟通不新增协议事件（协议 §5.2）。
 */

import { randomUUID } from 'node:crypto'
import { sseResponse, type WfEmitter } from './sse.ts'
import type { AiClient, StreamFinishResult } from './client.ts'
import { safeParseArgs } from './client.ts'
import type { ChatMessage, ToolDefinition } from './types.ts'

// ── 类型 ─────────────────────────────────────────────────

export interface ToolContext {
  /** 工具执行声道：emit('wf:tool_progress', ...) 或 emit('x:*', ...) */
  emit: WfEmitter
  /** 用户取消 → abort（长任务应响应此 signal） */
  signal?: AbortSignal
}

export interface AgentTool {
  name: string
  description?: string
  parameters?: Record<string, unknown>
  /** args 来自 LLM（JSON），未类型化——工具内部自行收窄 */
  run: (args: Record<string, unknown>, tool: ToolContext) => unknown
}

export interface AgentConfig {
  model?: string
  systemPrompt: string
  tools: AgentTool[]
  /** 默认 10 */
  maxSteps?: number
  /** 每个工具执行前要求人工审批（协议 §4.5） */
  humanInTheLoop?: boolean
  /** 审批超时（默认 5 分钟），到期按拒绝处理 */
  approvalTimeoutMs?: number
}

export interface AgentRunOptions {
  signal?: AbortSignal
  traceId?: string
}

export interface AgentRunner {
  /** 运行 agent → SSE Response（wf: 协议事件流），路由直接 return */
  run: (messages: ChatMessage[], options?: AgentRunOptions) => Response
}

// ── 引擎 ─────────────────────────────────────────────────

export function createAgent(client: AiClient, config: AgentConfig): AgentRunner {
  const maxSteps = config.maxSteps ?? 10
  const toolDefs: ToolDefinition[] = config.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.parameters ?? {} },
  }))

  function run(messages: ChatMessage[], options?: AgentRunOptions): Response {
    const controller = new AbortController()
    const external = options?.signal
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', () => controller.abort(), { once: true })
    }

    return sseResponse(
      async (emit) => {
        emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
        await loop(messages, emit, controller.signal)
      },
      { onAbort: () => controller.abort() },
    )
  }

  async function loop(messages: ChatMessage[], emit: WfEmitter, signal?: AbortSignal): Promise<void> {
    const all: ChatMessage[] = [{ role: 'system', content: config.systemPrompt }, ...messages]
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) return

      emit('wf:step', { type: 'llm' })
      let finish: StreamFinishResult = { content: '', toolCalls: [] }
      await client.streamStep(
        { model: config.model, messages: all, tools: toolDefs },
        {
          emit,
          signal,
          emitUsage: false, // agent 只发累积 usage（done 前统一发）
          onFinish: (r) => {
            finish = r
            if (r.usage) {
              usage.prompt_tokens += r.usage.prompt_tokens ?? 0
              usage.completion_tokens += r.usage.completion_tokens ?? 0
              usage.total_tokens += r.usage.total_tokens ?? 0
            }
          },
        },
      )
      if (signal?.aborted) return

      // 无工具调用 → 完成
      if (!finish.toolCalls?.length) {
        emit('wf:usage', usage)
        emit('wf:done', { content: finish.content, usage })
        return
      }

      // 有工具调用：assistant 消息（含 tool_calls + reasoning_content）必须先入上下文——
      // provider 要求 role:'tool' 的消息必须跟在带 tool_calls 的 assistant 消息后，
      // 且 thinking 模式的 reasoning_content 必须回传（陷阱清单 #4）
      all.push({
        role: 'assistant',
        content: finish.content ?? '',
        reasoning_content: finish.reasoning_content,
        tool_calls: finish.toolCalls,
      })

      // 执行每个工具调用（并行调用逐个执行）
      for (const tc of finish.toolCalls) {
        if (signal?.aborted) return
        const name = tc.function?.name ?? ''
        const args = safeParseArgs(tc.function?.arguments ?? '')
        emit('wf:step', { type: 'tool', toolCallId: tc.id, name })

        // HITL：执行前挂起等待人工审批
        let execArgs = args
        if (config.humanInTheLoop) {
          const decision = await client.waitApproval(
            { id: randomUUID(), toolCallId: tc.id, name, args },
            emit,
            config.approvalTimeoutMs,
          )
          if (decision.decision === 'rejected') {
            emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'rejected', message: decision.note ?? '用户拒绝' } })
            all.push({ role: 'tool', content: `Human rejected: ${decision.note ?? ''}`, tool_call_id: tc.id, name })
            continue // 拒绝 ≠ 终止：agent 换方案
          }
          if (decision.decision === 'modified' && decision.modifiedArgs) execArgs = decision.modifiedArgs
        }

        const tool = config.tools.find((t) => t.name === name)
        if (!tool) {
          emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'tool_error', message: `工具不存在: ${name}` } })
          all.push({ role: 'tool', content: `Error: tool not found: ${name}`, tool_call_id: tc.id, name })
          continue
        }

        try {
          const output = await tool.run(execArgs, { emit, signal })
          emit('wf:tool_result', { id: tc.id, ok: true, output })
          all.push({ role: 'tool', content: JSON.stringify(output ?? ''), tool_call_id: tc.id, name })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'tool_error', message: msg } })
          all.push({ role: 'tool', content: `Error: ${msg}`, tool_call_id: tc.id, name })
        }
      }
      // 下一轮循环：LLM 看到 tool results 继续推理
    }

    // maxSteps 耗尽：返回当前内容
    emit('wf:usage', usage)
    emit('wf:done', { content: '', usage })
  }

  return { run }
}
