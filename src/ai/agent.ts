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
import type { ChatMessage, ToolDefinition, WfStep, WfToken, WfToolResult, WfUsage } from './types.ts'

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

/** agent 执行步骤（结构化结果用，协议 wf:step/wf:tool_result 的汇总） */
export interface AgentStep {
  type: 'llm' | 'tool_call' | 'tool_result'
  content?: string
  toolCall?: { id: string; name: string; arguments: string }
  toolResult?: string
}

/** 结构化运行结果（非流式服务编排用；流式场景走 stream/SSE 的 wf:* 事件） */
export interface AgentRunResult {
  content: string
  steps: AgentStep[]
  usage?: WfUsage
}

export interface AgentRunner {
  /** 运行 agent → SSE Response（wf: 协议事件流），路由直接 return */
  run: (messages: ChatMessage[], options?: AgentRunOptions) => Response
  /**
   * 事件流模式：wf:* 事件打到自定义 emitter（SSE 只是默认实现）。
   * 应用层可把事件接到 WS/回调/自有协议（协议适配器）——不绑死传输通道。
   */
  stream: (
    messages: ChatMessage[],
    options?: { emit: WfEmitter; signal?: AbortSignal; traceId?: string },
  ) => Promise<void>
  /** 结构化结果模式：收集 wf:* 事件 → AgentRunResult（非流式服务编排用） */
  runToResult: (messages: ChatMessage[], options?: AgentRunOptions) => Promise<AgentRunResult>
}

// ── 引擎 ─────────────────────────────────────────────────

export function createAgent(client: AiClient, config: AgentConfig): AgentRunner {
  const maxSteps = config.maxSteps ?? 10
  const toolDefs: ToolDefinition[] = config.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description ?? '', parameters: t.parameters ?? {} },
  }))

  /** 统一控制器：外部 signal → 内部 AbortController（stream/run/runToResult 共用） */
  function createController(external?: AbortSignal): AbortController {
    const controller = new AbortController()
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', () => controller.abort(), { once: true })
    }
    return controller
  }

  /** 事件流模式：wf:* 事件打到自定义 emitter（SSE 只是默认实现，应用层可接 WS/回调/自有协议） */
  async function stream(
    messages: ChatMessage[],
    options?: { emit: WfEmitter; signal?: AbortSignal; traceId?: string },
  ): Promise<void> {
    const controller = createController(options?.signal)
    const emit = options?.emit ?? (() => {})
    emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
    await loop(messages, emit, controller.signal)
  }

  /** 运行 agent → SSE Response（默认通道；路由直接 return） */
  function run(messages: ChatMessage[], options?: AgentRunOptions): Response {
    const controller = createController(options?.signal)
    return sseResponse(
      async (emit) => {
        emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
        await loop(messages, emit, controller.signal)
      },
      { onAbort: () => controller.abort() },
    )
  }

  /** 结构化结果模式：收集 wf:* 事件 → AgentRunResult（非流式服务编排用） */
  async function runToResult(messages: ChatMessage[], options?: AgentRunOptions): Promise<AgentRunResult> {
    let content = ''
    const steps: AgentStep[] = []
    let usage: WfUsage | undefined
    const emit: WfEmitter = (name, data) => {
      if (name === 'wf:token') {
        content += (data as WfToken).text
      } else if (name === 'wf:step') {
        const s = data as WfStep
        if (s.type === 'llm') steps.push({ type: 'llm', content: s.content })
        else steps.push({ type: 'tool_call', toolCall: { id: s.toolCallId ?? '', name: s.name ?? '', arguments: '' } })
      } else if (name === 'wf:tool_result') {
        const r = data as WfToolResult
        const last = steps[steps.length - 1]
        if (last && last.type === 'tool_call') {
          steps[steps.length - 1] = {
            type: 'tool_result',
            toolCall: last.toolCall,
            toolResult: r.ok ? JSON.stringify(r.output ?? '') : `Error: ${r.error?.message ?? 'unknown'}`,
          }
        }
      } else if (name === 'wf:usage') {
        usage = data as WfUsage
      }
    }
    const controller = createController(options?.signal)
    await loop(messages, emit, controller.signal)
    return { content, steps, usage }
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

  return { run, stream, runToResult }
}
