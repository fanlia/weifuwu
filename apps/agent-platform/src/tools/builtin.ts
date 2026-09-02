/**
 * 内置 Tool 注册 — 全局注册可被 agent.ts registerTool 调用的工具
 *
 * 在 server.ts 启动时调用 registerBuiltinTools(ctx) 注册所有内置工具
 */

import type { ToolDefinition } from '../ai/types.ts'
import { registerTools } from './registry.ts'
import type { Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/**
 * 内置工具定义列表（用于 LLM tool_choice 配置）
 */
export const BUILTIN_TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '从 Agent 绑定的知识库中检索相关信息。当用户问题涉及文档、产品手册、FAQ 等内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或问题描述',
          },
          top_k: {
            type: 'number',
            description: '返回结果数量，默认 5',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '根据文字描述生成图片（z-image-turbo 文生图模型）。生成后自动保存到部门共享目录（/ws——交付物中心可见）。用户要求画图/配图/海报灵感等场景使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片详细描述——主体/风格/构图/光线/颜色（越具体效果越好）' },
          size: { type: 'string', description: '尺寸 "宽*高"，默认 "1024*1024"' },
          filename: { type: 'string', description: '保存文件名（如 logo.png）——留空自动命名' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: '根据文字描述生成视频（HappyHorse 文生视频模型——阿里云百炼异步任务）。提交后约 1-5 分钟生成完成，完成后自动保存到部门共享目录（/ws——交付物中心可见）。提交立即返回任务 ID——用 video_generation_status 查询进展。用户要求生成视频/宣传片/动画/动态画面等场景使用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频内容详细描述——主体/场景/运动/风格/镜头（越具体效果越好，≤5000 字符）' },
          resolution: { type: 'string', description: '分辨率：480P/720P/1080P（默认 1080P）' },
          ratio: { type: 'string', description: '宽高比：16:9（默认）/9:16/1:1/4:3/3:4/4:5/5:4/9:21/21:9' },
          duration: { type: 'number', description: '视频时长（秒，3-15，默认 5）' },
          filename: { type: 'string', description: '保存文件名（如 promo.mp4）——留空自动命名' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'video_generation_status',
      description: '查询视频生成任务进度（generate_video 返回的 task_id）。生成完成返回已保存到 /ws 的路径；失败返回原因。用户在询问「视频生成好了吗/进度如何」时使用。',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'generate_video 返回的任务 ID' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前日期和时间，当用户询问时间时使用',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_agent',
      description: '调用同租户的另一个 AI Agent 处理任务（传入其名称或 ID + 任务描述），返回该 Agent 的回复。用于专业分工：把子任务委托给擅长该领域的 Agent（如数据分析/客服）。',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: '目标 Agent 名称或 ID（同租户的 ai 类型 Agent）' },
          message: { type: 'string', description: '委托给该 Agent 的任务描述' },
        },
        required: ['agent', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_tasks',
      description: '将复杂任务拆解为最多 3 个子任务并并行分派给专业 Agent 执行——每个子任务指定目标 Agent（名称或 ID）+ 可执行任务描述。适合多目标/多文件产出/多步调研类任务（如「分析数据并写报告」）；简单任务不要用（直接回答——拆解浪费 token 与延迟）。返回各子任务的回复（带来源标注）。',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: '子任务清单（最多 3 个——超出截断）',
            items: {
              type: 'object',
              properties: {
                agent: { type: 'string', description: '目标 Agent 名称或 ID（同租户 ai 类型——专业分工：数据分析/客服/文档等）' },
                message: { type: 'string', description: '子任务描述（具体到可执行——含必要上下文——拆解质量决定结果质量）' },
              },
              required: ['agent', 'message'],
            },
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'survey_campaign_start',
      description: '启动批量问卷填写任务（Campaign）——按人设角色池批量派单 AI 填写问卷（水位并发——每个角色独立沙盒）。当用户要求「让 N 个/一批 AI 机器人填写问卷」「模拟 N 人填问卷」时使用。总量与并发可配置。',
      parameters: {
        type: 'object',
        properties: {
          total: { type: 'number', description: '填写总量（角色数——如 1000）' },
          concurrency: { type: 'number', description: '同时在线填写数（并发上限——默认 5——服务层硬上限 10（2027-09 定参：试点 100 @10 已实测 0 失败——20 判负不做））' },
          url: { type: 'string', description: '问卷 URL（缺省用平台默认问卷页）' },
          retry: { type: 'number', description: '失败重试次数（默认 2）' },
        },
        required: ['total', 'concurrency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'survey_campaign_status',
      description: '查看批量问卷任务进度（完成数/失败数/在线/失败清单）。用户在询问「填到哪了/进度如何/完成了吗」时使用。',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: { type: 'string', description: '任务 ID（启动时返回）' },
        },
        required: ['campaign_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'survey_campaign_retry',
      description: '重跑批量问卷任务的失败角色（重新派单——attempts 清零）。用户说「重跑失败的/失败的再填一次」时使用。',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: { type: 'string', description: '任务 ID' },
        },
        required: ['campaign_id'],
      },
    },
  },
]

/**
 * 在 server.ts 启动时调用，注册内置工具 handler
 */
export function registerBuiltinTools(getCtx: () => AppCtx): void {
  registerTools({
    search_knowledge_base: async (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => {
      const ctx = getCtx()
      const query = String(args.query ?? '')
      const topK = Math.min(20, Math.max(1, Number(args.top_k ?? 5)))
      if (!query) return '请提供搜索关键词'
      // B6（2026-08）：单实现源——builtin 与 skill 共用 kb-search（此前双份实现——
      // skill 版用旧列 tenant_id 漂移实证——工具报错）；agentId 经 toolCtx
      // （2027-09——闭包注入退役——kb 绑定知识库过滤）
      const { searchKnowledgeBase } = await import('../services/kb-search.ts')
      return searchKnowledgeBase(ctx as any, query, topK, toolCtx?.agentId != null ? String(toolCtx.agentId) : null)
    },


    generate_image: async (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => {
      const ctx = getCtx()
      const { generateImage } = await import('./image-gen.ts')
      return generateImage(ctx, {
        prompt: String(args.prompt ?? ''),
        size: args.size != null ? String(args.size) : undefined,
        filename: args.filename != null ? String(args.filename) : undefined,
        departmentId: toolCtx?.departmentId != null ? String(toolCtx.departmentId) : undefined,
      })
    },

    generate_video: async (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => {
      const ctx = getCtx()
      const { createVideoTask } = await import('./video-gen.ts')
      const out = await createVideoTask(ctx, {
        prompt: String(args.prompt ?? ''),
        resolution: args.resolution != null ? String(args.resolution) : undefined,
        ratio: args.ratio != null ? String(args.ratio) : undefined,
        duration: args.duration != null ? Number(args.duration) : undefined,
        watermark: args.watermark != null ? args.watermark === true : undefined,
        filename: args.filename != null ? String(args.filename) : undefined,
        departmentId: toolCtx?.departmentId != null ? String(toolCtx.departmentId) : undefined,
        agentId: toolCtx?.agentId != null ? String(toolCtx.agentId) : undefined,
      })
      return `视频生成任务已提交（task_id=${out.taskId}）——生成中约 1-5 分钟——完成后自动保存到部门共享目录。用 video_generation_status 查询进度`
    },

    video_generation_status: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const id = String(args.task_id ?? '')
      if (!id) return 'Error: task_id 必填'
      const { getVideoTask, describeVideoTask } = await import('./video-gen.ts')
      const row = await getVideoTask(ctx, id)
      if (!row) return `Error: 视频任务 ${id} 不存在或无权限访问`
      return describeVideoTask(row)
    },

    get_current_time: async (_args: Record<string, unknown>) => {
      const now = new Date()
      return now.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      second: '2-digit',
      })
    },

    call_agent: async (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => {
      const ctx = getCtx()
      const target = String(args.agent ?? '')
      const message = String(args.message ?? '')
      if (!target || !message) return 'Error: call_agent 需要 agent 和 message 参数'
      return delegateToAgent(ctx, target, message, toolCtx)
    },

    // O1-O4（ORCHESTRATION-PLAN Wave 1）：复杂任务拆解 + 并行派发（plan_tasks）
    plan_tasks: async (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => {
      const ctx = getCtx()
      const tasks = Array.isArray(args.tasks) ? args.tasks : []
      if (tasks.length === 0) return 'Error: plan_tasks 需要 tasks 数组（至少 1 个子任务）'
      // 上限截断（LLM 乱给不信任——成本纪律：多任务 ≠ 高质量，3 个封顶）
      const MAX_TASKS = 3
      const filtered = tasks
        .slice(0, MAX_TASKS)
        .filter((t) => {
          const tt = t as Record<string, unknown>
          return String(tt.agent ?? '') && String(tt.message ?? '')
        })
      if (filtered.length === 0) return 'Error: 子任务必须包含 agent 和 message 字段'
      // O11 任务树（Wave 3）：编排 run 落库（planned→running——收尾时 done/partial）
      let runId = ''
      try {
        const { createOrchestrationRun } = await import('../services/orchestration.ts')
        runId = await createOrchestrationRun(ctx, {
          appId: ctx.appId,
          departmentId: String(toolCtx?.departmentId ?? ''),
          orchestratorId: String(toolCtx?.agentId ?? ''),
          plan: filtered.map((t) => {
            const tt = t as Record<string, unknown>
            return { agent: String(tt.agent), message: String(tt.message).slice(0, 500) }
          }),
          requestId: (ctx as any).requestId,
        })
      } catch { /* 树记录失败不阻断执行 */ }
      // O9 失败重试（Wave 3）：worker 执行失败（非确定性——「调用失败/执行异常」）→
      // 重试 1 次；确定性错误（找不到/循环/深度超限）不重试（重试无意义——浪费）
      const isRetryable = (r: string) => r.startsWith('Error:') && (r.includes('调用 Agent') || r.includes('执行异常'))
      const runWorker = async (t: { agent: string; message: string }): Promise<string> => {
        let r = await delegateToAgent(ctx, t.agent, t.message, toolCtx)
        if (isRetryable(r)) r = await delegateToAgent(ctx, t.agent, t.message, toolCtx)
        return r
      }
      // O2 并行调度：Promise.allSettled 并发执行（上限 3）——失败隔离
      const results = await Promise.allSettled(
        filtered.map((t) => {
          const tt = t as Record<string, unknown>
          return runWorker({ agent: String(tt.agent), message: String(tt.message) })
        }),
      )
      // O11 收尾 + O9 部分完成标注（worker_results 全量——审计可见）
      const workers = results.map((r, i) => {
        const tt = filtered[i] as Record<string, unknown>
        const label = String(tt.agent ?? '子任务')
        if (r.status === 'fulfilled') {
          const v = String(r.value ?? '')
          if (v.startsWith('Error:')) return { agent: label, status: 'error' as const, error: v.slice(0, 300) }
          return { agent: label, status: 'ok' as const, result: v.slice(0, 500) }
        }
        return { agent: label, status: 'error' as const, error: String((r.reason as Error)?.message ?? '未知').slice(0, 300) }
      })
      if (runId) {
        try {
          const { finishOrchestrationRun } = await import('../services/orchestration.ts')
          const failedCount = workers.filter((w) => w.status === 'error').length
          await finishOrchestrationRun(ctx, {
            runId,
            status: failedCount === 0 ? 'done' : failedCount === workers.length ? 'failed' : 'partial',
            workers,
          })
        } catch { /* 记录失败不阻断 */ }
      }
      // O4 汇总：按任务数组顺序拼接（带来源标注——delegateToAgent 已含）
      return results.map((r, i) => {
        const tt = filtered[i] as Record<string, unknown>
        const label = String(tt.agent ?? '子任务')
        if (r.status === 'fulfilled') return r.value
        return `Error: 子任务「${label}」执行异常: ${String((r.reason as Error)?.message ?? '未知错误')}`
      }).join('\n\n')
    },

    // S2（2027-09）：问卷批量任务（Campaign 工具面——调度助手 agent 调用——
    // 用户聊天「让 N 人填问卷」→ 助手解析 → 本工具启动——产品正确触发面）
    survey_campaign_start: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const total = Math.max(1, Number(args.total ?? 0) || 10)
      const concurrency = Math.max(1, Number(args.concurrency ?? 0) || 5)
      const url = args.url ? String(args.url) : ''
      const retry = Number(args.retry ?? 0)
      const { createCampaign } = await import('../services/survey-campaign.ts')
      const out = await createCampaign(ctx, { total, concurrency, url, retry: retry || undefined })
      return `问卷任务已启动（id=${out.campaign.id}）——总量 ${out.campaign.total} · 并发 ${out.campaign.concurrency}。用 survey_campaign_status 查询进度；完成后可用 survey_campaign_retry 重跑失败角色。`
    },
    survey_campaign_status: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const id = String(args.campaign_id ?? '')
      if (!id) return 'Error: campaign_id 必填'
      const { getCampaign } = await import('../services/survey-campaign.ts')
      const out = await getCampaign(ctx, id)
      if (!out) return `Error: campaign ${id} 不存在`
      const { campaign, runs } = out
      const failures = runs.filter((r) => r.status === 'failed')
      return `问卷任务 ${id.slice(0, 8)}：状态 ${campaign.status} · 完成 ${campaign.completed}/${campaign.total} · 失败 ${campaign.failed} · 在线 ${runs.filter((r) => r.status === 'running').length} · 排队 ${runs.filter((r) => r.status === 'queued').length}` +
        (failures.length > 0 ? `
失败清单：${failures.map((f) => `${f.agent_name}（${f.error ?? '超时'}）`).join('；')}——可 survey_campaign_retry 重跑` : '')
    },
    survey_campaign_retry: async (args: Record<string, unknown>) => {
      const ctx = getCtx()
      const id = String(args.campaign_id ?? '')
      if (!id) return 'Error: campaign_id 必填'
      const { retryCampaign, getCampaign } = await import('../services/survey-campaign.ts')
      const out = await getCampaign(ctx, id)
      if (!out) return `Error: campaign ${id} 不存在`
      await retryCampaign(ctx, id)
      return `已重跑失败角色（campaign ${id.slice(0, 8)}——失败 ${out.campaign.failed} 个已重新排队）——用 survey_campaign_status 跟踪`
    },
  })
}

/**
 * 共享委托函数（O1/O3——call_agent 与 plan_tasks worker 同一实现源——
 * 防双处漂移）：目标查找/深度防环/部门归属/runAgent 调用/结果包装。
 */
async function delegateToAgent(ctx: AppCtx, target: string, message: string, toolCtx?: Record<string, unknown>): Promise<string> {
  if (!target || !message) return 'Error: 委托需要 agent 和 message 参数'
  // P1-4 委托背景：被委托方知道"谁在委托、为什么"（AI/人可替换——同事间移交要有来龙去脉）
  const callerId = String(toolCtx?.agentId ?? '')
  let callerName = '未知同事'
  if (callerId) {
    const rows = await ctx.sql`SELECT name FROM agents WHERE id = ${callerId}`
    if (rows[0]) callerName = String(rows[0].name)
  }
  const delegatedMessage = `[来自 ${callerName} 的委托] ${message}`
  // 深度限制（防环：A→B→A 或过深链）
  const depth = Number((ctx as any)._agentDepth ?? 0)
  const MAX_DEPTH = 2
  if (depth >= MAX_DEPTH) return `Error: Agent 协作深度超限（最多 ${MAX_DEPTH} 层）——请直接回答而非继续委托`
  // 找目标 Agent（同租户 + ai/department 类型 + 激活；名称或 ID）——
  // department = 部门经理（组织层级：可把任务委托给部门代表）
  const [targetAgent] = await ctx.sql`
    SELECT * FROM agents
    WHERE (name = ${target} OR id::text = ${target}) AND app_id = ${ctx.appId}
      AND type IN ('ai', 'department') AND is_active = TRUE
  `
  if (!targetAgent) return `Error: 找不到可调用的 AI Agent「${target}」（需同租户且已激活）`
  const ta = targetAgent as any
  if (String(ta.id) === String(toolCtx?.agentId ?? '')) return 'Error: 不能调用自己（循环）'
  // 组织层级：被委托 agent 在其**自己所在部门**执行（工作目录/沙盒归属自己的部门）
  let targetDept = String(toolCtx?.departmentId ?? '')
  try {
    const [memberDept] = await ctx.sql`
      SELECT dm.department_id FROM department_members dm
      JOIN departments d ON d.id = dm.department_id
      WHERE dm.agent_id = ${ta.id} AND d.is_dm = FALSE LIMIT 1
    `
    if (memberDept?.department_id) targetDept = String(memberDept.department_id)
  } catch { /* 部门查询失败用当前部门 */ }
  // 委托给子 Agent：复用 runAgent（其自身工具/知识库/协作全可用——递归）
  const { runAgent } = await import('../services/agent-runner.ts')
  ;(ctx as any)._agentDepth = depth + 1
  try {
    const result = await runAgent(ctx, {
      agentId: String(ta.id),
      appId: ctx.appId,
      departmentId: targetDept,
      systemPrompt: String(ta.system_prompt ?? '你是一个 AI 助手'),
      model: ta.model ? String(ta.model) : undefined,
      tools: (ta.tools ?? []) as unknown[],
      maxSteps: 3,
      humanInTheLoop: !!ta.human_in_the_loop,
      workspacePath: ta.workspace_path ? String(ta.workspace_path) : undefined,
      allowFileTools: !!ta.allow_file_tools,
      allowCommandExec: !!ta.allow_command_exec,
      allowNetwork: !!ta.allow_network,
    }, [{ role: 'user', content: delegatedMessage }])
    return `[${String(ta.name)} 的回复]\n${result.content}`
  } catch (e) {
    return `Error: 调用 Agent「${String(ta.name)}」失败: ${(e as Error)?.message ?? '未知错误'}`
  } finally {
    ;(ctx as any)._agentDepth = depth // 恢复（同 Agent 多次调用互不影响）
  }
}
