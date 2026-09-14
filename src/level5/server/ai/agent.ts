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
  /** **会话上下文（2027-09——AgentConfig.toolContext 透传）**：业务上下文
   *  （departmentId/appId/requestId 等——调用方自定义）——工具 run 直接读
   *  ——消除「闭包注入」（应用层 getCtx + _toolXXX 属性——注入顺序 bug
   *  结构性来源：agent-platform 技能工具「无部门上下文」实证） */
  context?: Record<string, unknown>
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
  /** BYOK：per-call 覆盖全局 apiKey/baseUrl（租户自带模型 Key——商业化 G4） */
  apiKey?: string
  baseUrl?: string
  systemPrompt: string
  tools: AgentTool[]
  /** 默认 10 */
  maxSteps?: number
  /**
   * 每个工具执行前要求人工审批（协议 §4.5）。
   * 支持函数：按工具调用动态判定（C2 条件审批——风险分级）——
   * 返回 true 需审批，false 自动执行。
   */
  humanInTheLoop?: boolean | ((call: { name: string; args: unknown }) => boolean)
  /** 审批超时（默认 5 分钟），到期按拒绝处理 */
  approvalTimeoutMs?: number
  /** **工具会话上下文（2027-09）**：透传到每次工具调用的 ToolContext.context——
   *  业务上下文单一注入面（调用方闭包零侵入——工具不再需要拿应用的
   *  ctx 闭包/读注入属性）——框架工具（HITL 审批等）未来同面 */
  toolContext?: Record<string, unknown>
  /**
   * O13 并行工具（2026-08——ORCHESTRATION-PLAN Wave 4）：单 step 多 tool_call
   * 并发执行（默认关——不突改既有行为）。
   * 约束：任一工具调用需审批（humanInTheLoop）→ 整批回退串行（审批是
   * 例外路径——不并发等待多个审批——黑盒风险）；工具独立性由调用方
   * 保证（沙盒/文件工具共享资源面——per-sandbox 串行队列层兜底）。
   * 结果按 tool_call 顺序写入上下文（provider 要求 role:tool 跟随顺序）。
   */
  parallelTools?: boolean
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

  /** 统一控制器：外部 signal → 内部 AbortController（stream/run/runToResult 共用）
   *  A5 修复（2027-XX）：release() 移除外部监听器——长生命周期 signal（worker 复用）
   *  不累积监听器（旧代码 addEventListener 后永不清理）
   */
  function createController(external?: AbortSignal): { signal: AbortSignal; abort: () => void; release: () => void } {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', onAbort, { once: true })
    }
    return {
      signal: controller.signal,
      abort: () => controller.abort(),
      release: () => external?.removeEventListener('abort', onAbort),
    }
  }

  /** 事件流模式：wf:* 事件打到自定义 emitter（SSE 只是默认实现，应用层可接 WS/回调/自有协议） */
  async function stream(
    messages: ChatMessage[],
    options?: { emit: WfEmitter; signal?: AbortSignal; traceId?: string },
  ): Promise<void> {
    const { signal, release } = createController(options?.signal)
    const emit = options?.emit ?? (() => {})
    try {
      emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
      await loop(messages, emit, signal)
    } finally {
      release()
    }
  }

  /** 运行 agent → SSE Response（默认通道；路由直接 return） */
  function run(messages: ChatMessage[], options?: AgentRunOptions): Response {
    const { signal, abort, release } = createController(options?.signal)
    return sseResponse(
      async (emit) => {
        try {
          emit('wf:message_start', { id: options?.traceId ?? randomUUID() })
          await loop(messages, emit, signal)
        } finally {
          release()
        }
      },
      { onAbort: () => abort() },
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
    const { signal, release } = createController(options?.signal)
    try {
      await loop(messages, emit, signal)
    } finally {
      release()
    }
    return { content, steps, usage }
  }

  async function loop(messages: ChatMessage[], emit: WfEmitter, signal?: AbortSignal): Promise<void> {
    const all: ChatMessage[] = [{ role: 'system', content: config.systemPrompt }, ...messages]
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    // A3 修复：跨轮内容累积——done.content 与 token 流一致（协议 §3.4「完整内容」；
    // 旧代码只含最后一轮——多轮 round 文本丢失——实证；runToResult 同口径）
    let content = ''

    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) return

      emit('wf:step', { type: 'llm' })
      let finish: StreamFinishResult = { content: '', toolCalls: [] }
      await client.streamStep(
        { model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl, messages: all, tools: toolDefs },
        {
          emit,
          signal,
          emitUsage: false, // agent 只发累积 usage（done 前统一发）
          onFinish: (r) => {
            finish = r
            if (r.content) content += r.content
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
        emit('wf:done', { content, usage, reasoning: finish.reasoning_content })
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

      // 执行每个工具调用（O13：parallelTools 且无审批 → 并发；否则串行——现状）
      // 结果按 tool_call 顺序写入上下文（provider 要求 role:tool 跟随 tool_calls 顺序）
      const toolResults: Array<{ role: 'tool'; content: string; tool_call_id: string; name: string }> = []
      const runOneToolCall = async (tc: NonNullable<typeof finish.toolCalls>[number]): Promise<void> => {
        if (signal?.aborted) return
        const name = tc.function?.name ?? ''
        const args = safeParseArgs(tc.function?.arguments ?? '')
        emit('wf:step', { type: 'tool', toolCallId: tc.id, name, args: tc.function?.arguments ?? '{}' })

        // HITL：执行前挂起等待人工审批（C2：函数模式按工具调用判定——风险分级）
        let execArgs = args
        const needApproval = typeof config.humanInTheLoop === 'function'
          ? config.humanInTheLoop({ name, args })
          : !!config.humanInTheLoop
        if (needApproval) {
          const decision = await client.waitApproval(
            { id: randomUUID(), toolCallId: tc.id, name, args },
            emit,
            config.approvalTimeoutMs,
            signal, // A4：取消也收尾（旧代码挂满 timeout——SSE 取消后白等 5 分钟）
          )
          if (decision.decision === 'rejected') {
            emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'rejected', message: decision.note ?? '用户拒绝' } })
            toolResults.push({ role: 'tool', content: `Human rejected: ${decision.note ?? ''}`, tool_call_id: tc.id, name })
            return // 拒绝 ≠ 终止：agent 换方案
          }
          if (decision.decision === 'modified' && decision.modifiedArgs) execArgs = decision.modifiedArgs
        }

        const tool = config.tools.find((t) => t.name === name)
        if (!tool) {
          emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'tool_error', message: `工具不存在: ${name}` } })
          toolResults.push({ role: 'tool', content: `Error: tool not found: ${name}`, tool_call_id: tc.id, name })
          return
        }

        try {
          const output = await tool.run(execArgs, { emit, signal, ...(config.toolContext ? { context: config.toolContext } : {}) })
          emit('wf:tool_result', { id: tc.id, ok: true, output })
          toolResults.push({ role: 'tool', content: JSON.stringify(output ?? ''), tool_call_id: tc.id, name })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          emit('wf:tool_result', { id: tc.id, ok: false, error: { code: 'tool_error', message: msg } })
          toolResults.push({ role: 'tool', content: `Error: ${msg}`, tool_call_id: tc.id, name })
        }
      }

      if (config.parallelTools && finish.toolCalls.length > 1) {
        // 并行前置检查：任一工具需审批 → 回退串行（审批例外路径不并发）
        const anyNeedsApproval = finish.toolCalls.some((tc) => {
          const name = tc.function?.name ?? ''
          const args = safeParseArgs(tc.function?.arguments ?? '')
          return typeof config.humanInTheLoop === 'function'
            ? config.humanInTheLoop({ name, args })
            : !!config.humanInTheLoop
        })
        if (anyNeedsApproval) {
          for (const tc of finish.toolCalls) await runOneToolCall(tc)
        } else {
          await Promise.all(finish.toolCalls.map((tc) => runOneToolCall(tc)))
        }
      } else {
        for (const tc of finish.toolCalls) await runOneToolCall(tc)
      }
      // 结果按 tool_call 声明顺序写入（并发完成顺序无关——provider 上下文要求）
      for (const tc of finish.toolCalls) {
        const r = toolResults.find((x) => x.tool_call_id === tc.id)
        if (r) all.push(r)
      }
      // 下一轮循环：LLM 看到 tool results 继续推理
    }

    // maxSteps 耗尽：返回当前内容（A3——旧代码 content:'' 丢一切——实证）
    emit('wf:usage', usage)
    emit('wf:done', { content, usage })
  }

  return { run, stream, runToResult }
}
