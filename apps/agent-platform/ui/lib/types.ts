/**
 * agent-platform 共享类型 — API 实体与页面状态（Wave 5：页面状态类型化）
 *
 * 后端返回结构对齐 src/routes/*.ts（字段缺省可空——后端宽松，前端兜底）。
 */

/** Agent 类型 */
export type AgentType = 'ai' | 'user' | 'webhook' | 'knowledge_base'

export interface TokenUsage {
  total_tokens: number
  total_prompt: number
  total_completion: number
  run_count: number
}

export interface Agent {
  id: string
  tenant_id?: string
  company_id?: string | null
  type: AgentType
  name: string
  avatar_url?: string | null
  description?: string | null
  model?: string | null
  system_prompt?: string | null
  temperature?: number | null
  max_tokens?: number | null
  human_in_the_loop?: boolean
  user_id?: string | null
  webhook_url?: string | null
  chunk_size?: number | null
  chunk_overlap?: number | null
  tools?: string[] | null
  is_active?: boolean
  workspace_path?: string | null
  allow_file_tools?: boolean
  allow_command_exec?: boolean
  webhook_secret?: string | null
  webhook_retry_count?: number | null
  created_at?: string
  updated_at?: string
  /** GET /api/agents 附加（ai 类型） */
  token_usage?: TokenUsage
}

/** 部门成员（department_members join agents——后端 SELECT a.id 别名 id） */
export interface Member {
  /** agent id（后端 SELECT a.id） */
  id: string
  name: string
  type?: AgentType
  role?: string | null
  avatar_url?: string | null
}

export interface Department {
  id: string
  company_id?: string
  tenant_id?: string
  name: string
  description?: string | null
  created_at?: string
  member_count?: number
  /** GET /api/departments 附加（会话列表） */
  last_message?: string | null
  last_message_at?: string | null
  members?: Member[]
  /** 部门列表附加 */
  is_dm?: boolean
  company_name?: string | null
}

export interface Company {
  id: string
  name: string
  description?: string | null
  created_at?: string
  agent_count?: number
  department_count?: number
}

/** 消息工具调用卡 */
export interface MessageTool {
  name: string
  args?: unknown
  status: 'running' | 'done' | 'error'
  result?: unknown
}

/** 消息状态（前端流式驱动） */
export type MessageStatus = 'idle' | 'thinking' | 'generating' | 'complete' | 'error'

export interface Message {
  id: string
  department_id: string
  sender_id: string
  sender_name?: string | null
  sender_type?: AgentType | 'system' | 'ai'
  content: string
  msg_type?: 'text' | 'system'
  created_at: string
  status?: MessageStatus
  tools?: MessageTool[]
  usage?: { total_tokens: number }
  /** 回复引用（reply_to JOIN messages 预览） */
  reply_to?: string | null
  reply_content?: string | null
  reply_sender?: string | null
  /** HITL 草稿 */
  ai_draft?: string | null
  ai_approved?: boolean | null
}

/** 角色模板 */
export interface RoleTemplate {
  slug: string
  name: string
  description?: string | null
  category?: string | null
  system_prompt?: string | null
  tools?: string[] | null
  icon?: string | null
  usage_count?: number
  is_new?: boolean
}

export interface Skill {
  id: string
  name: string
  description?: string | null
  type?: string
}

export interface AgentLog {
  id: string
  agent_id?: string
  messages_count?: number
  steps_count?: number
  tokens_prompt?: number
  tokens_completion?: number
  tokens_total?: number
  elapsed_ms?: number
  success?: boolean
  created_at?: string
}

export interface WebhookLog {
  id: string
  agent_id?: string
  request_body?: unknown
  response_body?: unknown
  response_status?: number
  elapsed_ms?: number
  success?: boolean
  created_at?: string
}

/** 已绑定技能（agent_skills 表） */
export interface BoundSkill {
  id: string
  skill_name: string
  skill_dir?: string
  enabled?: boolean
  created_at?: string
  /** 前端展示回填（bindSkill 从 available 取） */
  name?: string
  description?: string
  slug?: string
}

/** 可用技能（/api/skills/available）——宽松（不同技能目录结构不同） */
export interface AvailableSkill {
  id?: string
  slug?: string
  name?: string
  description?: string
  dir?: string
  skill_dir?: string
  meta?: { name?: string; description?: string }
}

export interface KbDocument {
  id: string
  agent_id: string
  filename: string
  chunk_count?: number
  created_at?: string
}

export interface KbChunk {
  id: string
  content: string
  score?: number
  chunk_index?: number
}

export interface UserInfo {
  id: string
  email: string
  name: string
  role?: string
  created_at?: string
}

/** 埋点事件（激活漏斗） */
export type TrackEvent = 'register_complete' | 'agent_created' | 'first_message'

export interface FunnelRow {
  event: TrackEvent
  count: number
}

// ── API 响应 ────────────────────────────────────────────────

export interface ApiList<T> {
  total?: number
}

export interface AgentListResponse extends ApiList<Agent> {
  agents: Agent[]
}

export interface DepartmentListResponse extends ApiList<Department> {
  departments: Department[]
}

export interface MessageListResponse {
  messages: Message[]
}

export interface CompanyListResponse extends ApiList<Company> {
  companies: Company[]
}

export interface TemplateListResponse {
  templates: RoleTemplate[]
}

export interface SkillListResponse {
  skills: Skill[]
}

export interface StatsByAgentRow {
  agent_id: string
  agent_name: string
  total_tokens: number
  run_count: number
}

export interface DailyMessageRow {
  day: string
  count: number
}

export interface StatsResponse {
  totals: {
    agents: number
    departments: number
    messages: number
    members: number
  }
  daily_messages: DailyMessageRow[]
  tokens_by_agent: StatsByAgentRow[]
}

export interface FunnelResponse {
  funnel: FunnelRow[]
}

/** /api/stats/funnel 响应 */
export interface FunnelData {
  mine: { register_complete: boolean; agent_created: boolean; first_message: boolean }
  platform: Partial<Record<TrackEvent, number>>
}

/** 待审批草稿（HITL） */
export interface PendingApproval {
  id: string
  department_id: string
  content?: string
  ai_draft?: string | null
  created_at?: string
  agent_name?: string | null
  agent_type?: AgentType
  department_name?: string | null
}

/** /api/stats 响应 */
export interface StatsData {
  agents?: { total: number; ai_count?: number; webhook_count?: number; kb_count?: number; user_count?: number }
  departments?: { total: number }
  messages?: { total: number }
  tokens?: { total_prompt: number; total_completion: number; total_tokens: number }
  trend?: DailyMessageRow[]
}

/** /api/stats/tokens-by-agent 响应项 */
export interface CostAgentRow {
  id: string
  name: string
  type: AgentType
  run_count: number
  tokens_total: number
  tokens_prompt?: number
  tokens_completion?: number
}

// ── 页面事件参数辅助 ────────────────────────────────────────

/** Input/Textarea onInput 的 (e: Event) → 输入值 */
export function inputValue(e: Event): string {
  return (e.target as HTMLInputElement | HTMLTextAreaElement).value
}
