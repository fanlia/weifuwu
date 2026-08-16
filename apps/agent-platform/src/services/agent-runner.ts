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
import { resolveDepartmentWorkspace } from '../middleware/workspace.ts'
import { getWorkspaceToolDefs, createWorkspaceHandlers } from '../tools/workspace.ts'
import { getToolHandler } from '../tools/registry.ts'
import { byokParamsOf } from './byok.ts'
import { aiEmit, aiActionFromWf } from './ai-events.ts'
import type { WfEmitter } from 'weifuwu'

export interface AgentRunnerConfig {
  agentId: string
  appId: string
  departmentId: string
  /** C1 断点续跑：执行归属消息 id（步骤落库锚点） */
  runMessageId?: string
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

  // 解析工作空间路径（三层模型：目录归属部门——{root}/{department_id}/，或自定义路径）
  // 组织层级 + 问卷角色（2026-12）：agent 带 department_id（代表/执行归属部门）时按它解析工作目录——
  // 经理在上级部门被 @ = 在代表部门干活；问卷角色在「问卷调研」被 @ = 在各角色独立部门沙盒（并发）
  if (config.allowFileTools && config.departmentId) {
    let resolvedWs: string | null = null
    let wsDeptId = config.departmentId
    try {
      const [ag] = await ctx.sql`SELECT type, department_id FROM agents WHERE id = ${config.agentId}`
      if ((ag as any)?.department_id) {
        wsDeptId = String((ag as any).department_id)
      }
    } catch { /* 类型查询失败用当前部门 */ }
    try {
      const [dept] = await ctx.sql`SELECT is_dm, workspace_path, artifact_review FROM departments WHERE id = ${wsDeptId}`
      if (dept) {
        resolvedWs = await resolveDepartmentWorkspace(wsDeptId, (dept as any).workspace_path, true)
        // 产物审批模式（2026-12）：AI 的写入落在待审区 {ws}/.pending（AI 感知为 /ws 正常）——
        // 批准后宿主移动到共享目录。工具注册用待审区路径（容器挂载点 = 待审区）
        if (resolvedWs && (dept as any).artifact_review) {
          const { join } = await import('node:path')
          const { mkdir } = await import('node:fs/promises')
          const pending = join(resolvedWs, '.pending')
          await mkdir(pending, { recursive: true }).catch(() => {})
          resolvedWs = pending
        }
      }
    } catch (err: any) {
      console.warn(`[agent-runner] 部门工作空间查询失败: ${err?.message ?? ''}`)
    }
    if (resolvedWs) {
      const wsTools = getWorkspaceToolDefs(config.allowCommandExec ?? false)
      pushUnique(wsTools)
      try {
        // 沙盒归属 = 部门（sandbox 绑定 department_id——M2 后按记录执行）
        const wsHandlers = createWorkspaceHandlers(resolvedWs, config.allowCommandExec ?? false, config.departmentId, config.allowNetwork)
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
      // 工具上下文：暴露当前 AI agent id + 执行部门（call_agent 委托链传播）
      ;(ctx as any)._toolAgentId = config.agentId
      ;(ctx as any)._toolDepartmentId = config.departmentId
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

/** C1/C3 共享：任务纪律提示 + 会话记忆加载（runAgent/streamAgent 共用） */
const TASK_DISCIPLINE = `
【沙盒环境】
- python3 可用，预装库：openpyxl(Excel xlsx)/pandas(数据分析)/pypdf(PDF)/
  python-docx(Word)/python-pptx(PPT)
- 需要其他 Python 库时：pip install --break-system-packages <包>（需网络权限）
- 处理文件（表格/文档/PDF）优先写 python 脚本经 bash 执行——不要只描述步骤
【浏览器环境】
- agent-browser CLI 可用（已内置 chromium）——需要真实浏览网页/读取页面内容/
  截图时，用 agent-browser 命令操作（open/read/snapshot/screenshot）
- 表单填写（模拟数据收集/问卷）：open 打开页面 → snapshot 读题目与控件 ref →
  用 fill <ref> <值>（文本）/ select <ref> <值>（下拉）/ check <ref>（勾选）/
  click <ref>（单选与提交）→ 提交后 read/snapshot 验证成功页——全部真实浏览器操作
- 浏览器任务完成后必须执行 agent-browser close 关闭浏览器会话（页面不关 =
  连接保持 = 统计页误判在线）
- 本地页面用 http://host.docker.internal:3000/... 访问（宿主服务）
- 浏览器操作需网络权限；无网络时只可操作本地内容
【任务纪律】
1. 工具失败时不要直接放弃：先尝试换一个工具/方案重试；确实无法完成时，在回复中明确说明"未能完成的原因"。
2. 任务完成后按以下结构汇报：
   - ✅ 已完成：列出完成的事项
   - ⚠️ 未完成：列出未完成的事项及原因（没有则省略）
   - 📦 产物：生成的文件/结果位置（没有则省略）
3. 如果用户目标不明确，先说明你的理解再执行。
4. 工具已返回结果时，直接基于结果回答用户——不要重复调用同一工具，也不要再次请求工具（除确需补充信息外）。`

async function loadMemory(ctx: AppCtx, agentId: string): Promise<string> {
  try {
    const [mem] = await ctx.sql`SELECT content FROM agent_memories WHERE agent_id = ${agentId}`
    return mem && String((mem as any).content ?? '').trim() ? String((mem as any).content).slice(0, 1500) : ''
  } catch { return '' }
}

function buildAgentPrompt(base: string, memory: string): string {
  return base + (memory ? `\n【历史记忆】${memory}\n` : '') + TASK_DISCIPLINE
}

/** C3 记忆更新（任务后提取背景——共享） */
async function updateMemory(ctx: AppCtx, ai: any, byok: { apiKey?: string; baseUrl?: string; model?: string }, agentId: string, messages: ChatMessage[], content: string, existing: string, lightModel?: string): Promise<void> {
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const memRes = await ai.chat({
      model: lightModel ?? byok.model, apiKey: byok.apiKey, baseUrl: byok.baseUrl,
      messages: [
        { role: 'system', content: '从对话中提取值得长期记住的用户偏好或项目约定（如：用户喜欢简洁回复/项目使用 TypeScript）。没有值得记住的则输出空字符串。只输出记忆内容，最多 100 字。' },
        { role: 'user', content: `用户：${String(lastUser.content ?? '').slice(0, 800)}\n助手：${String(content).slice(0, 800)}` },
      ],
      max_tokens: 120,
    })
    const memText = String((memRes as any)?.choices?.[0]?.message?.content ?? '').trim()
    if (memText && memText.length > 3) {
      const merged = existing ? `${existing}\n- ${memText.slice(0, 500)}`.slice(0, 2000) : memText.slice(0, 500)
      await ctx.sql`
        INSERT INTO agent_memories (agent_id, content, updated_at)
        VALUES (${agentId}, ${merged}, NOW())
        ON CONFLICT (agent_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      `
    }
  } catch { /* 记忆更新失败静默 */ }
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
  // C3 会话记忆：任务前注入（跨会话背景——用户偏好/项目约定）
  const memoryInjected = await loadMemory(ctx, config.agentId)
  // C5 轻量模型：内部调用（记忆提取/自校验）用小模型——Agent 配置 light_model
  let lightModel: string | undefined
  try {
    const [agL] = await ctx.sql`SELECT light_model FROM agents WHERE id = ${config.agentId}`
    lightModel = (agL as any)?.light_model ? String((agL as any).light_model) : undefined
  } catch { /* 查询失败用主模型 */ }

  // C1 任务纪律：失败恢复引导 + 结构化汇报（共享）
  const agentRunner = ai.agent({
    model: byok.model ?? config.model,
    apiKey: byok.apiKey,
    baseUrl: byok.baseUrl,
    systemPrompt: buildAgentPrompt(config.systemPrompt, memoryInjected),
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

  // C3 记忆更新：任务完成后提取背景（共享函数）
  if (result.content) {
    await updateMemory(ctx, ai, byok, config.agentId, messages, String(result.content), memoryInjected, lightModel)
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
  // C1/C3：任务纪律 + 会话记忆（共享——streamAgent 主路径）
  const memoryInjected = await loadMemory(ctx, config.agentId)
  // C5 轻量模型（内部调用用小模型）
  let lightModel: string | undefined
  try {
    const [agL] = await ctx.sql`SELECT light_model FROM agents WHERE id = ${config.agentId}`
    lightModel = (agL as any)?.light_model ? String((agL as any).light_model) : undefined
  } catch { /* 查询失败用主模型 */ }
  const agentRunner = ai.agent({
    model: byok.model ?? config.model,
    apiKey: byok.apiKey,
    baseUrl: byok.baseUrl,
    systemPrompt: buildAgentPrompt(config.systemPrompt, memoryInjected),
    tools,
    maxSteps: config.maxSteps ?? 10,
    humanInTheLoop: humanGate,
  })

  let fullContent = ''
  let finalUsage: WfUsage | undefined
  let lastToolName = ''
  let _finished = false
  // C1 断点续跑：步骤落库串行链（emit 同步——fire-and-forget 保序）
  let runStateChain: Promise<unknown> = Promise.resolve()
  let lastTokenText = ''

  // 框架 agent 事件流：wf:* 事件 → 业务回调（onChunk/onToolCall/onToolResult/onFinish）
  const emit: WfEmitter = (name, data) => {
    // AI 事件流（三端打通——vdom + ai + sandbox）：wf:* → ai:* 统一模型——
    // target = agentId——payload 含 messageId/departmentId（跨层关联键）
    try {
      const aiAction = aiActionFromWf(name)
      const aiPayload: Record<string, unknown> = { ...(data as Record<string, unknown> ?? {}) }
      if (config.runMessageId) aiPayload.messageId = config.runMessageId
      if (config.departmentId) aiPayload.departmentId = config.departmentId
      // 降频：token 逐字太频——只发首个（流式进度可见）——完整内容由 done 的 content 覆盖
      if (name === 'wf:token') {
        if (lastTokenText !== '') return
        const text = String((data as WfToken).text ?? '')
        lastTokenText = text
        aiPayload.text = text
      }
      aiEmit(aiAction, config.agentId, aiPayload)
    } catch { /* ai 事件发射失败不阻断 */ }
    if (name === 'wf:done' && !_finished) {
      _finished = true
      // C3 记忆更新（流式完成后——后台提取，不阻塞回复）
      void updateMemory(ctx, ai, byok, config.agentId, messages, fullContent, memoryInjected, lightModel)
    }
    if (name === 'wf:token') {
      const text = (data as WfToken).text
      fullContent += text
      callbacks.onChunk(text)
    } else if (name === 'wf:step') {
      const s = data as WfStep
      if (s.type === 'tool' && s.name) {
        lastToolName = s.name
        callbacks.onToolCall?.({ name: s.name, args: s.args ?? '' })
        // C1 断点续跑：步骤实时落库（中断后可恢复上下文）
        if (config.runMessageId) {
          runStateChain = runStateChain
            .then(() => ctx.sql`
              INSERT INTO agent_run_states (message_id, agent_id, department_id, app_id, steps, status)
              VALUES (${config.runMessageId ?? ''}, ${config.agentId}, ${config.departmentId}, ${config.appId},
                ${JSON.stringify([{ tool: s.name, args: s.args ?? '', at: new Date().toISOString() }])}, 'running')
              ON CONFLICT (message_id) DO UPDATE SET
                steps = agent_run_states.steps || EXCLUDED.steps,
                status = 'running', updated_at = NOW()
            `)
            .catch(() => {})
        }
      }
    } else if (name === 'wf:tool_result') {
      const r = data as WfToolResult
      const result = r.ok ? (typeof r.output === 'string' ? r.output : JSON.stringify(r.output ?? '')) : `Error: ${r.error?.message ?? 'unknown'}`
      callbacks.onToolResult?.({ name: lastToolName, result })
      // C1：工具结果摘要落库
      if (config.runMessageId) {
        runStateChain = runStateChain
          .then(() => ctx.sql`
            UPDATE agent_run_states SET
              steps = steps || ${JSON.stringify([{ tool: lastToolName, result: result.slice(0, 200), ok: r.ok, at: new Date().toISOString() }])},
              updated_at = NOW()
            WHERE message_id = ${config.runMessageId ?? ''}
          `)
          .catch(() => {})
      }
    } else if (name === 'wf:usage') {
      finalUsage = data as WfUsage
    } else if (name === 'wf:done') {
      callbacks.onFinish?.({ content: fullContent })
    }
  }

  await agentRunner.stream(messages, { emit })

  // C1：执行完成标记（中断 vs 完成可区分）——等落库链排空
  await runStateChain.catch(() => {})
  try {
    await ctx.sql`
      UPDATE agent_run_states SET status = 'done', updated_at = NOW()
      WHERE message_id = ${config.runMessageId ?? ''} AND status = 'running'
    `
  } catch { /* 状态更新失败不影响 */ }

  return finalUsage
}
