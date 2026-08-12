/**
 * 角色模板路由 — 预置 Agent 角色模板数据 + 从模板创建 Agent
 *
 * GET /api/role-templates — 公开，在 server.ts 中注册
 * POST /api/agents/from-template — 需认证，在 protected routes 中注册
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export interface RoleTemplate {
  slug: string
  name: string
  icon: string
  category: string
  description: string
  default_system_prompt: string
  default_model: string | null
  default_temperature: number
  default_max_tokens: number
  default_allow_file_tools: boolean
  default_allow_command_exec: boolean
  default_workspace_hint: string | null
  default_skills: string[]
  /** 使用计数（内存——运营展示「热门模板」） */
  usage_count?: number
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    slug: 'developer',
    name: '开发助手',
    icon: '👨‍💻',
    category: 'engineering',
    description: '辅助代码编写、重构、Debug、Code Review。需要项目工作目录。',
    default_system_prompt: '你是一个资深软件开发工程师。帮助分析代码、编写代码、调试问题。使用 read 工具了解项目结构，write/edit 工具修改代码，bash 工具运行测试。',
    default_model: null,
    default_temperature: 0.7,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: true,
    default_workspace_hint: '项目根目录路径（如 /data/projects/my-app）',
    default_skills: ['search-knowledge-base', 'get-current-time'],
  },
  {
    slug: 'customer-support',
    name: '智能客服',
    icon: '🎧',
    category: 'support',
    description: '自动回复用户问题，支持知识库检索和人工审批。',
    default_system_prompt: '你是一个专业的客服助手。根据知识库准确回答用户问题。如果无法确定，请礼貌地转接人工客服。',
    default_model: null,
    default_temperature: 0.5,
    default_max_tokens: 2048,
    default_allow_file_tools: false,
    default_allow_command_exec: false,
    default_workspace_hint: null,
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'product-manager',
    name: '产品经理助手',
    icon: '📋',
    category: 'product',
    description: '撰写 PRD、分析需求、管理 Roadmap、竞品分析。',
    default_system_prompt: '你是一个资深产品经理。帮助撰写产品文档、分析用户需求、梳理 Roadmap。输出文档保存在工作目录中。',
    default_model: null,
    default_temperature: 0.8,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: false,
    default_workspace_hint: '文档工作区路径（如 /data/docs/products）',
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'data-analyst',
    name: '数据分析师',
    icon: '📊',
    category: 'data',
    description: 'SQL 查询、数据可视化、报表生成。需要命令执行权限。',
    default_system_prompt: '你是一个数据分析师。使用 SQL 查询数据、编写脚本处理数据、生成图表、撰写分析报告。',
    default_model: null,
    default_temperature: 0.6,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: true,
    default_workspace_hint: '分析工作区路径（如 /data/analytics）',
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'hr-assistant',
    name: 'HR 助手',
    icon: '🏢',
    category: 'operations',
    description: '员工政策问答、入职流程、招聘跟进。',
    default_system_prompt: '你是 HR 助手。根据公司政策文档回答员工问题，协助处理入职、休假等流程。对所有人事相关的输出保持专业和保密。',
    default_model: null,
    default_temperature: 0.5,
    default_max_tokens: 2048,
    default_allow_file_tools: false,
    default_allow_command_exec: false,
    default_workspace_hint: null,
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'ops-bot',
    name: '运维机器人',
    icon: '🔧',
    category: 'engineering',
    description: '系统监控、告警响应、自动化运维。需命令执行权限，高危操作需审批。',
    default_system_prompt: '你是运维工程师。响应告警、排查故障、执行维护操作。高危操作（rm、drop、deploy 等）需要人工审批。所有操作记录日志。',
    default_model: null,
    default_temperature: 0.3,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: true,
    default_workspace_hint: '运维脚本目录（如 /data/ops/scripts）',
    default_skills: ['search-knowledge-base', 'get-current-time'],
  },
  {
    slug: 'sales-assistant',
    name: '销售助手',
    icon: '📈',
    category: 'business',
    description: '方案撰写、报价管理、Pipeline 跟踪。',
    default_system_prompt: '你是销售助手。帮助撰写方案书、跟进线索、管理 Pipeline。输出文档保存在工作目录中。',
    default_model: null,
    default_temperature: 0.7,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: false,
    default_workspace_hint: '销售文档目录（如 /data/sales/proposals）',
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'executive-assistant',
    name: '高管助理',
    icon: '👔',
    category: 'management',
    description: '数据汇总、报告生成、跨部门协调。',
    default_system_prompt: '你是高管助理。汇总多部门数据、生成报告、协调跨部门工作。对外输出需要相关方确认。',
    default_model: null,
    default_temperature: 0.6,
    default_max_tokens: 4096,
    default_allow_file_tools: false,
    default_allow_command_exec: false,
    default_workspace_hint: null,
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'general',
    name: '通用助手',
    icon: '🤖',
    category: 'general',
    description: '通用 AI 助手，无特殊权限。适合简单问答场景。',
    default_system_prompt: '你是一个有用的 AI 助手。',
    default_model: null,
    default_temperature: 0.7,
    default_max_tokens: 2048,
    default_allow_file_tools: false,
    default_allow_command_exec: false,
    default_workspace_hint: null,
    default_skills: [],
  },
]

/** 获取所有角色模板（供 server.ts 公共路由使用） */
export function getRoleTemplates(): RoleTemplate[] {
  // 热门模板优先（usage_count 降序——运营位）
  return [...ROLE_TEMPLATES].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))
}

/**
 * 注册受保护的角色模板路由
 * 在 protectedRoutes 中调用
 */
export function registerRoleTemplateRoutes(app: Router<AppCtx>): void {
  // ── 从模板创建 Agent ───────────────────────────────
  app.post('/api/agents/from-template', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, tenantId } = ctx
    const body = await req.json() as {
      template_slug: string
      name: string
      description?: string
      system_prompt?: string
      model?: string
      temperature?: number
      max_tokens?: number
      workspace_path?: string
      allow_file_tools?: boolean
      allow_command_exec?: boolean
    }

    const template = ROLE_TEMPLATES.find(t => t.slug === body.template_slug)
    if (!template) {
      return Response.json({ error: `模板 "${body.template_slug}" 不存在` }, { status: 400 })
    }
    if (!body.name?.trim()) {
      return Response.json({ error: 'name 为必填' }, { status: 400 })
    }

    const [agent] = await sql`
      INSERT INTO agents (
        tenant_id, type, name, description,
        model, system_prompt, temperature, max_tokens,
        workspace_path, allow_file_tools, allow_command_exec,
        tools, human_in_the_loop, template_slug
      ) VALUES (
        ${tenantId}, 'ai', ${body.name.trim()}, ${body.description ?? template.description},
        ${body.model ?? template.default_model},
        ${body.system_prompt ?? template.default_system_prompt},
        ${body.temperature ?? template.default_temperature},
        ${body.max_tokens ?? template.default_max_tokens},
        ${body.workspace_path ?? template.default_workspace_hint ?? null},
        ${body.allow_file_tools ?? template.default_allow_file_tools},
        ${body.allow_command_exec ?? template.default_allow_command_exec},
        '[]', FALSE, ${template.slug}
      )
      RETURNING id, name, type, created_at
    `

    // 使用计数（内存递增——运营展示）
    template.usage_count = (template.usage_count ?? 0) + 1

    // 绑定默认技能
    const defaultSkills: string[] = template.default_skills ?? []
    for (const skillName of defaultSkills) {
      try {
        const { resolve, dirname } = await import('node:path')
        const { fileURLToPath } = await import('node:url')
        const __dirname = dirname(fileURLToPath(import.meta.url))
        const skillDir = resolve(__dirname, '..', '..', 'skills', 'builtin', skillName)

        await sql`
          INSERT INTO agent_skills (agent_id, skill_name, skill_dir)
          VALUES (${agent.id}, ${skillName}, ${skillDir})
          ON CONFLICT (agent_id, skill_name) DO NOTHING
        `
      } catch {
        console.warn(`[role-templates] 绑定技能 ${skillName} 失败`)
      }
    }

    return Response.json({ agent }, { status: 201 })
  })
}
