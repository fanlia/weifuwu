/**
 * Agent 执行编排 — 调用 ctx.ai.agent 执行 AI Robot 的 Tool Loop
 *
 * 被 chat.ts 服务层调用，处理部门消息 → AI 自动回复
 *
 * 增强功能：
 * - token 用量统计与持久化
 * - 对话上下文窗口管理（按 token 计数截断）
 * - 执行日志记录
 */

import type { Context, ChatMessage, AgentRunResult, AgentTool } from 'weifuwu'
import type { WfToken, WfStep, WfToolResult, WfUsage, WfDone } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import type { ToolDefinition } from '../ai/types.ts'
import { SkillRegistry } from './skills.ts'
import type { SkillContext } from './skills.ts'
import { resolveAgentWorkspace } from '../middleware/workspace.ts'
import { getWorkspaceToolDefs, createWorkspaceHandlers } from '../tools/workspace.ts'
import { getToolHandler } from '../tools/registry.ts'
import type { WfEmitter } from 'weifuwu'

export interface AgentRunnerConfig {
  agentId: string
  tenantId: string
  departmentId: string
  systemPrompt: string
  model?: string
  tools: unknown[]
  maxSteps?: number
  humanInTheLoop?: boolean
  /** 可选：预加载的技能列表 */
  preloadedSkills?: SkillContext[]
  /** 可选：工作空间路径（启用文件工具） */
  workspacePath?: string
  /** 是否允许文件工具 */
  allowFileTools?: boolean
  /** 是否允许命令执行 */
  allowCommandExec?: boolean
  /** 是否允许网络访问（默认 false → --network none） */
  allowNetwork?: boolean
}

interface TokenCounter {
  prompt: number
  completion: number
  total: number
}

/**
 * 粗略估算 token 数（中英文混合场景）
 * 中文约 1.5 字/token，英文约 4 字符/token
 */
function estimateTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      tokens += 1.5 // 中文字符
    } else {
      tokens += 0.25 // 英文字符
    }
  }
  return Math.ceil(tokens)
}

/**
 * 计算消息列表的总 token 数
 */
function countMessagesTokens(messages: ChatMessage[]): TokenCounter {
  let prompt = 0
  for (const msg of messages) {
    prompt += estimateTokens(msg.content)
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        prompt += estimateTokens(tc.function.name + tc.function.arguments)
      }
    }
  }
  // 加上每条消息的开销（role 标记等）
  prompt += messages.length * 4
  return { prompt, completion: 0, total: prompt }
}

/**
 * 截断消息列表到最大 token 数（保留 system 消息和最近的 user/assistant 消息）
 */
function truncateMessages(
  messages: ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  const total = countMessagesTokens(messages)
  if (total.total <= maxTokens) return messages

  // 保留 system 消息
  const systemMsgs = messages.filter(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')

  // 从最旧的消息开始丢弃
  let trimmed = [...nonSystem]
  while (trimmed.length > 1 && countMessagesTokens([...systemMsgs, ...trimmed]).total > maxTokens) {
    trimmed.shift()
  }

  return [...systemMsgs, ...trimmed]
}

/**
 * 运行 Agent 并返回结果
 * 被消息发送后的钩子触发
 *
 * 增加：
 * - token 用量估算（当 API 不返回 usage 时）
 * - 上下文窗口截断（防止超长 context）
 * - 执行日志记录到数据库
 */
/**
 * 构建执行上下文：技能注册表 + 框架 AgentTool[]（run 分发到 skillRegistry / 全局工具注册表）
 */
async function buildToolContext(
  ctx: AppCtx,
  config: AgentRunnerConfig,
): Promise<{ tools: AgentTool[]; skillRegistry?: SkillRegistry }> {
  // 构建工具集：agent 声明工具 + 技能工具 + 工作空间工具——按工具名去重
  // （真实事故：内置工具 search_knowledge_base 既在 agent.tools 又在绑定技能里 →
  //  重复声明 → DeepSeek API 400 → streamStep 静默空内容 → AI 回复为空）
  const allTools: ToolDefinition[] = []
  const seenToolNames = new Set<string>()
  const pushUnique = (defs: ToolDefinition[]) => {
    for (const t of defs) {
      const name = (t as any).function?.name ?? (t as any).name
      if (!name || seenToolNames.has(name)) continue
      seenToolNames.add(name)
      allTools.push(t)
    }
  }
  pushUnique(config.tools as ToolDefinition[])

  // 构建 SkillRegistry（如果有预加载技能）
  let skillRegistry: SkillRegistry | undefined
  if (config.preloadedSkills && config.preloadedSkills.length > 0) {
    skillRegistry = new SkillRegistry(config.agentId)
    for (const skill of config.preloadedSkills) {
      skillRegistry.registerSkill(skill)
      pushUnique(skill.tools)
    }
  }

  // 解析工作空间路径（默认 {root}/{agent_id}/，或自定义路径）
  if (config.allowFileTools) {
    // 始终解析实际路径（自定义 null → 默认目录）——修复：buildToolContext 此前只看自定义路径导致默认路径工具不注册
    const resolvedWs = await resolveAgentWorkspace(config.agentId, config.workspacePath, true)
    if (resolvedWs) {
      const wsTools = getWorkspaceToolDefs(config.allowCommandExec ?? false)
      pushUnique(wsTools)
      try {
        const wsHandlers = createWorkspaceHandlers(resolvedWs, config.allowCommandExec ?? false, config.agentId, config.allowNetwork)
        if (!skillRegistry) skillRegistry = new SkillRegistry(config.agentId)
        skillRegistry.registerSkill({
          dir: resolvedWs,
          meta: { name: '__workspace__', description: '工作空间文件工具' },
          tools: wsTools,
          handlers: wsHandlers,
        })
      } catch (err: any) {
        console.warn(`[agent-runner] 工作空间初始化失败: ${err.message}`)
      }
    }
  }

  // 自研 ToolDefinition（声明）→ 框架 AgentTool（run 分发到 skillRegistry → 全局 toolHandlers）
  const tools: AgentTool[] = allTools.map(td => ({
    name: td.function.name,
    description: td.function.description,
    parameters: td.function.parameters,
    run: async (args) => {
      if (skillRegistry?.hasTool(td.function.name)) {
        return skillRegistry.executeTool(td.function.name, args)
      }
      const handler = getToolHandler(td.function.name)
      if (!handler) return `Error: tool handler for "${td.function.name}" not registered`
      // 工具上下文：暴露当前 AI agent id（search_knowledge_base 等需要知道是哪个 agent 在调用）
      ;(ctx as any)._toolAgentId = config.agentId
      try {
        const r = await handler(args)
        return typeof r === 'string' ? r : JSON.stringify(r)
      } finally {
        ;(ctx as any)._toolAgentId = undefined
      }
    },
  }))

  return { tools, skillRegistry }
}

export async function runAgent(
  ctx: AppCtx,
  config: AgentRunnerConfig,
  messages: ChatMessage[],
): Promise<AgentRunResult> {
  const { ai } = ctx

  // 上下文窗口管理：确保历史消息不超过 8000 tokens
  const contextMessages = truncateMessages(
    [
      { role: 'system' as const, content: config.systemPrompt },
      ...messages,
    ],
    8000,
  )

  const { tools } = await buildToolContext(ctx, config)

  const startTime = Date.now()

  // 框架 agent 引擎：结构化结果模式（content/steps/usage）
  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: config.humanInTheLoop ?? false,
  })

  const result = await agentRunner.runToResult(contextMessages.slice(1)) // 去掉 system，agent 内部会重新加

  const elapsed = Date.now() - startTime

  // 记录执行日志到数据库（如果 sql 可用）
  try {
    const { sql } = ctx as any
    if (sql) {
      await sql`
        INSERT INTO agent_logs (
          agent_id, tenant_id, department_id,
          messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total,
          elapsed_ms, success
        ) VALUES (
          ${config.agentId}, ${config.tenantId}, ${config.departmentId},
          ${messages.length}, ${result.steps.length},
          ${result.usage?.prompt_tokens ?? 0},
          ${result.usage?.completion_tokens ?? 0},
          ${result.usage?.total_tokens ?? 0},
          ${elapsed}, TRUE
        )
      `
    }
  } catch {
    // 日志记录失败不影响主流程
  }

  return result
}

/**
 * 流式运行 Agent（用于 WebSocket 推送）
 *
 * 增加 token 用量记录
 */
/** 对话预览：单轮流式（不落消息/不触发 HITL/审批）——AgentDetail 测试提示词用 */
export async function streamAgentPreview(
  ctx: AppCtx,
  agent: Record<string, any>,
  content: string,
  write: (chunk: string) => void,
): Promise<void> {
  const { ai, sql } = ctx
  const tools = typeof agent.tools === 'string' ? JSON.parse(agent.tools) : (agent.tools ?? [])
  const preloadedSkills = await loadAgentSkillsPreview(sql, agent.id, ctx)
  const config: AgentRunnerConfig = {
    agentId: agent.id,
    tenantId: ctx.tenantId,
    departmentId: '',
    systemPrompt: agent.system_prompt ?? '你是一个有帮助的 AI 助手。',
    model: agent.model,
    tools,
    maxSteps: agent.max_tokens ? Math.min(agent.max_tokens, 20) : 10,
    humanInTheLoop: false,
    preloadedSkills,
    workspacePath: agent.workspace_path,
    allowFileTools: agent.allow_file_tools,
    allowCommandExec: agent.allow_command_exec,
    allowNetwork: agent.allow_network,
  }
  const { tools: builtTools } = await buildToolContext(ctx, config)
  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools: builtTools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: false,
  })
  await agentRunner.stream([{ role: 'user', content }], {
    emit: (name, data) => {
      if (name === 'wf:token') write(`event: wf:token\ndata: ${JSON.stringify({ text: (data as WfToken).text })}\n\n`)
      else if (name === 'wf:tool_call') write(`event: wf:tool_call\ndata: ${JSON.stringify(data)}\n\n`)
      else if (name === 'wf:done') write(`event: wf:done\ndata: ${JSON.stringify({ content: (data as WfDone).content })}\n\n`)
      else if (name === 'wf:error') write(`event: wf:error\ndata: ${JSON.stringify((data as any).message ?? '')}\n\n`)
    },
  })
}

async function loadAgentSkillsPreview(sql: any, agentId: string, ctx: AppCtx): Promise<SkillContext[]> {
  try {
    const rows = (await sql`
      SELECT ask.skill_dir, ask.skill_name
      FROM agent_skills ask
      WHERE ask.agent_id = ${agentId} AND ask.enabled = TRUE
    `) as unknown as Array<Record<string, any>>
    const out: SkillContext[] = []
    for (const r of rows) {
      try {
        const { loadSkill } = await import('./skills.ts')
        out.push(await loadSkill(r.skill_dir, () => ctx))
      } catch { /* 技能加载失败跳过 */ }
    }
    return out
  } catch {
    return []
  }
}

export async function streamAgent(
  ctx: AppCtx,
  config: AgentRunnerConfig,
  messages: ChatMessage[],
  callbacks: {
    onChunk: (chunk: string) => void
    onToolCall?: (toolCall: { name: string; args: string }) => void
    onToolResult?: (result: { name: string; result: string }) => void
    onFinish?: (result: { content: string }) => void
  },
): Promise<WfUsage | undefined> {
  const { ai } = ctx
  const { tools } = await buildToolContext(ctx, config)

  const agentRunner = ai.agent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    tools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: config.humanInTheLoop ?? false,
  })

  let fullContent = ''
  let finalUsage: WfUsage | undefined
  let lastToolName = ''

  // 框架 agent 事件流：wf:* 事件 → 业务回调（onChunk/onToolCall/onToolResult/onFinish）
  const emit: WfEmitter = (name, data) => {
    if (name === 'wf:token') {
      const text = (data as WfToken).text
      fullContent += text
      callbacks.onChunk(text)
    } else if (name === 'wf:step') {
      const s = data as WfStep
      if (s.type === 'tool' && s.name) {
        lastToolName = s.name
        callbacks.onToolCall?.({ name: s.name, args: '' })
      }
    } else if (name === 'wf:tool_result') {
      const r = data as WfToolResult
      const result = r.ok ? (typeof r.output === 'string' ? r.output : JSON.stringify(r.output ?? '')) : `Error: ${r.error?.message ?? 'unknown'}`
      callbacks.onToolResult?.({ name: lastToolName, result })
    } else if (name === 'wf:usage') {
      finalUsage = data as WfUsage
    } else if (name === 'wf:done') {
      callbacks.onFinish?.({ content: fullContent })
    }
  }

  await agentRunner.stream(messages, { emit })

  return finalUsage
}
