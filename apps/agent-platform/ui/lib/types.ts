/**
 * agent-platform 共享类型 — API 实体与页面状态（Wave 5：页面状态类型化）
 *
 * 后端返回结构对齐 src/routes/*.ts（字段缺省可空——后端宽松，前端兜底）。
 */

/** Agent 类型 */
export type AgentType = 'ai' | 'user' | 'webhook' | 'knowledge_base' | 'department'

/** 类型元数据单源（AGENT-TYPES-OPTIMIZE W4）——label/icon/color/desc/creatable
 *  新增类型只改此处：UI（TypeBadge/向导卡片/头像）与后端校验/筛选全派生。
 *  creatable=false = 系统流程创建（如 user 注册自动建）——UI 不提供手动创建。 */
export const AGENT_TYPES: ReadonlyArray<{
  value: AgentType
  label: string
  icon: string
  color: string
  desc: string
  creatable: boolean
}> = [
  { value: 'ai', label: 'AI 机器人', icon: '🤖', color: '#8b5cf6', desc: 'DeepSeek 驱动，支持工具调用与人工审批', creatable: true },
  { value: 'user', label: '真实用户', icon: '👤', color: '#4f6ef7', desc: '注册自动创建（绑定登录账号）——UI 不提供手动创建（防 user_id=null 孤儿）', creatable: false },
  { value: 'webhook', label: 'Webhook', icon: '🔗', color: '#f59e0b', desc: '通过 HTTP Webhook 收发消息', creatable: true },
  { value: 'knowledge_base', label: '知识库', icon: '📚', color: '#22c55e', desc: 'PGVector 文档语义检索', creatable: true },
  { value: 'department', label: '部门经理', icon: '🏢', color: '#0ea5e9', desc: '代表部门对外协作（可加入上级部门形成组织层级）', creatable: true },
]

/** 后端校验/筛选全量列表（含 department——G5） */
export const AGENT_TYPE_LIST: readonly AgentType[] = AGENT_TYPES.map(t => t.value)

export interface TokenUsage {
  total_tokens: number
  total_prompt: number
  total_completion: number
  run_count: number
}

export interface Agent {
  id: string
  app_id?: string
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
  /** GET /api/agents/:id 附加（user 类型绑定账号） */
  bound_email?: string | null
  bound_user_name?: string | null
  /** GET /api/agents/:id 详情附加（角色/专家/配额——AgentDetail 使用） */
  role_label?: string | null
  expertise?: string | null
  monthly_token_quota?: number | null
  quota_used?: number | null
  memory?: string | null
  light_model?: string | null
  risk_policy?: string | null
  whisper_enabled?: boolean | null
  whisper_agent_id?: string | null
  memory_loaded?: boolean | null
  webhook_platform?: string | null
  im_bind_dept?: string | null
  kb_id?: string | null
  allow_network?: boolean
  department_id?: string | null
}

/** 部门成员（department_members join agents——后端 SELECT a.id 别名 id） */
export interface Member {
  /** agent id（后端 SELECT a.id） */
  id: string
  name: string
  type?: AgentType
  role?: string | null
  role_label?: string | null
  expertise?: string | null
  avatar_url?: string | null
}

export interface Department {
  id: string
  app_id?: string
  name: string
  description?: string | null
  created_at?: string
  member_count?: number
  /** 人类成员数（UX-PLAN-2 波次 2——0 = 单 AI 待命间：列表引导加人而非发消息） */
  human_count?: number
  /** GET /api/departments 附加（会话列表） */
  last_message?: string | null
  last_message_at?: string | null
  /** 产物审批模式（2026-12） */
  artifact_review?: boolean
  members?: Member[]
  /** 部门列表附加 */
  is_dm?: boolean
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
  attachments?: Array<{ name: string; path?: string; size: number }> | null
  status?: MessageStatus
  tools?: MessageTool[]
  usage?: { total_tokens: number }
  /** 回复引用（reply_to JOIN messages 预览） */
  reply_to?: string | null
  /** R6 质量反馈：AI 回复点赞/点踩 */
  feedback?: 'like' | 'dislike' | null
  /** O8 意图路由：本 AI 回复由语义路由派给的目标 Agent 名（显示「任务派给 X」） */
  routed_to?: string | null
  reply_content?: string | null
  reply_sender?: string | null
  /** HITL 草稿 */
  ai_draft?: string | null
  ai_approved?: boolean | null
  /** CHAT-INTERACTION 波次 2：快捷确认选项（AI [[choices:...]] 剥离后——气泡 chip） */
  quick_replies?: string[] | null
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
  default_allow_file_tools?: boolean
  default_allow_command_exec?: boolean
  default_allow_network?: boolean
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
export type TrackEvent = 'register_complete' | 'invite_join_complete' | 'agent_created' | 'first_message'

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
  /** 近 7 天活跃 Agent 排行（统计面板「活跃度」） */
  active_agents?: { id: string; name: string; type: string; message_count: number; last_active_at?: string }[]
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

// ── 运营/版本类型（Settings/AgentDetail 类型化——消除 any） ─────
export interface AgentVersion {
  id: string
  version: number
  note: string | null
  snapshot: Record<string, unknown>
  created_at: string
}
export interface AuditEntry {
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
  user_name: string | null
}
export interface OpsInfo {
  sandbox: {
    available: boolean; enabled?: boolean; imageReady?: boolean
    mode?: string; poolSize?: number; maxContainers?: number
  }
  auditToday: number
  license?: { key: string; edition: 'community' | 'licensed'; expiresAt: string | null; expired: boolean }
}

/** 前端流式消息形态（Chat 页 + MessageItem 共享——WS 推送对象字段不全，宽松） */
export interface ChatMessage {
  id: string
  department_id?: string
  sender_id: string
  sender_name?: string | null
  sender_type?: string
  content: string
  msg_type?: string
  created_at: string
  status: string
  tools: MessageTool[]
  usage?: { total_tokens: number }
  ai_draft?: string | null
  ai_approved?: boolean | null
  /** CHAT-INTERACTION 波次 2：快捷确认选项（AI [[choices:...]] 剥离后——气泡 chip） */
  quick_replies?: string[] | null
  reply_content?: string | null
  reply_sender?: string | null
  /** 被回复消息 id（retryMessage 透传——CHAT-UX 波次 4 E4；仅 loadMessages/POST 回包带） */
  reply_to?: string | null
  /** R6 质量反馈 */
  feedback?: 'like' | 'dislike' | null
  /** O8 意图路由：AI 回复由语义路由派给的目标 Agent 名 */
  routed_to?: string | null
  attachments?: Array<{ name: string; path: string; size: number }> | null
  /** 产物审批（2026-12）：AI 写入在待审区——待审批产物 */
  pending?: boolean
}
