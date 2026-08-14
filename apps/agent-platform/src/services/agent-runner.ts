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
import { byokParamsOf } from './byok.ts'
import type { WfEmitter } from 'weifuwu'

export interface AgentRunnerConfig {
  agentId: string
  appId: string
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
  /** C1 自校验：任务完成后模型自检（默认开；false 关闭省一次调用） */
  selfCheck?: boolean
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
  // 内置工具（get_current_time/call_agent 等）对所有 Agent 开箱可用——
  // 去重后加入（文件工具仍由 allowFileTools 控制——见下方 wsTools）
  try {
    const { BUILTIN_TOOL_DEFS } = await import('../tools/builtin.ts')
    pushUnique(BUILTIN_TOOL_DEFS as unknown as ToolDefinition[])
  } catch { /* 尽力 */ }
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
  // 商业化 G4 BYOK：租户自带模型 Key/端点 → 框架 per-call 覆盖（未配置走全局）
  const byok: { apiKey?: string; baseUrl?: string; model?: string } = await byokParamsOf(ctx.sql, config.appId).catch(() => ({}))
  // C2 风险分级审批：HITL 开启时按 Agent 风险策略动态判定（low 自动 / high 审批）
  const { needsApproval, riskOf } = await import('./risk-policy.ts')
  let riskPolicy: string = 'auto'
  try {
    const [ag] = await ctx.sql`SELECT risk_policy FROM agents WHERE id = ${config.agentId}`
    riskPolicy = String((ag as any)?.risk_policy ?? 'auto')
  } catch { /* 查询失败用默认 auto */ }
  const humanGate = config.humanInTheLoop
    ? (call: { name: string; args: unknown }): boolean => needsApproval(riskPolicy as any, call.name, call.args)
    : undefined
  // C1 任务纪律：失败恢复引导 + 结构化汇报（零额外调用——系统提示规则）
  const TASK_DISCIPLINE = `
【任务纪律】
1. 工具失败时不要直接放弃：先尝试换一个工具/方案重试；确实无法完成时，在回复中明确说明"未能完成的原因"。
2. 任务完成后按以下结构汇报：
   - ✅ 已完成：列出完成的事项
   - ⚠️ 未完成：列出未完成的事项及原因（没有则省略）
   - 📦 产物：生成的文件/结果位置（没有则省略）
3. 如果用户目标不明确，先说明你的理解再执行。`
  const agentRunner = ai.agent({
    model: byok.model ?? config.model,
    apiKey: byok.apiKey,
    baseUrl: byok.baseUrl,
    systemPrompt: config.systemPrompt + TASK_DISCIPLINE,
    tools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: humanGate,
  })

  const result = await agentRunner.runToResult(contextMessages.slice(1)) // 去掉 system，agent 内部会重新加

  // C1 自校验：任务完成后模型自检（低置信 → 追加"可能未完成"标注）
  if (config.selfCheck !== false && result.content) {
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUser) {
        const check = await ai.chat({
          model: byok.model ?? config.model,
          apiKey: byok.apiKey,
          baseUrl: byok.baseUrl,
          messages: [
            { role: 'system', content: '你是任务质检员。检查助手是否完整完成了用户目标。只输出 JSON：{"complete":true|false,"missing":"未完成部分摘要或空字符串"}' },
            { role: 'user', content: `用户目标：${String(lastUser.content ?? '').slice(0, 2000)}\n\n助手结果：${String(result.content).slice(0, 4000)}` },
          ],
          max_tokens: 150,
        })
        const raw = String((check as any)?.choices?.[0]?.message?.content ?? '').trim()
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) {
          const parsed = JSON.parse(m[0]) as { complete?: boolean; missing?: string }
          if (parsed.complete === false && parsed.missing) {
            result.content = `${String(result.content)}\n\n⚠️ 自查：以下部分可能未完成——${String(parsed.missing).slice(0, 300)}`
          }
        }
      }
    } catch { /* 自校验失败不阻断（低成本保护） */ }
  }

  const elapsed = Date.now() - startTime

  // 记录执行日志到数据库（如果 sql 可用）
  try {
    const { sql } = ctx as any
    if (sql) {
      await sql`
        INSERT INTO agent_logs (
          agent_id, app_id, department_id,
          messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total,
          elapsed_ms, success
        ) VALUES (
          ${config.agentId}, ${config.appId}, ${config.departmentId || null},
          ${messages.length}, ${result.steps?.length ?? 0},
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
    appId: ctx.appId,
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

  // 商业化 G4 BYOK：租户自带模型 Key/端点 → 框架 per-call 覆盖（未配置走全局）
  const byok: { apiKey?: string; baseUrl?: string; model?: string } = await byokParamsOf(ctx.sql, config.appId).catch(() => ({}))
  // C2 风险分级审批：HITL 开启时按 Agent 风险策略动态判定（low 自动 / high 审批）
  const { needsApproval, riskOf } = await import('./risk-policy.ts')
  let riskPolicy: string = 'auto'
  try {
    const [ag] = await ctx.sql`SELECT risk_policy FROM agents WHERE id = ${config.agentId}`
    riskPolicy = String((ag as any)?.risk_policy ?? 'auto')
  } catch { /* 查询失败用默认 auto */ }
  const humanGate = config.humanInTheLoop
    ? (call: { name: string; args: unknown }): boolean => needsApproval(riskPolicy as any, call.name, call.args)
    : undefined
  const agentRunner = ai.agent({
    model: byok.model ?? config.model,
    apiKey: byok.apiKey,
    baseUrl: byok.baseUrl,
    systemPrompt: config.systemPrompt,
    tools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: humanGate,
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
