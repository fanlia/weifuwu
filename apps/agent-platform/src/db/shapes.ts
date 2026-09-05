/**
 * agent-platform shapes —— 23 表 shape 全定义（P0——对准 schema.sql）
 *
 * 决策（platform-orm-迁移.md §P0）：字段名 = 列名（snake——平台接口即 snake，
 * 与框架内部模块同决策——f.col 列映射面不启用——映射恒等）。
 * 纪律：
 *   - 与 schema.sql 逐列对齐（shapes-alignment.test.ts 断言——新增列必须补 shape）
 *   - NOT NULL 无默认 → f.req（insert 必填）；有默认（now/random/字面量）→ 可由
 *     DB 侧生成（insertSchema 自动可缺省）；可空 → .nullable()
 *   - 平台判负面（表达式 upsert/FILTER）保留 SQL 逃生舱——不入 shape
 */
import { z, f, type ZodRawShape, type ZodType } from 'weifuwu'

const uuid = () => z.uuid()
const text = () => z.string()
const int = () => z.number().int()
const bool = () => z.boolean()
const jsonb = () => z.json()
const ts = () => z.date() // ISO 字符串（Infer=string——DB 原生形态单源）

/** 枚举值单源（W4——S1 定案）：shape 声明 + DDL enum + columnTypes 三面从这里派生——加枚举值只改这一处 */
export const AGENT_TYPES = ['ai', 'user', 'webhook', 'knowledge_base', 'department'] as const
/** 字面量 DB 默认（NOT NULL + DEFAULT——写入面可缺省·与 schema 对齐） */
const dflt = <T extends ZodType>(t: T, v: unknown): T => t.meta({ default: v }) as T

// ── agents（单表继承四类 agent + 组织层级经理 + 工具/配额） ──
export const agents = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  type: f.req(z.enum(AGENT_TYPES)),
  name: f.req(text()),
  avatar_url: text().nullable(),
  description: text().nullable(),
  role_label: text().nullable(),
  expertise: text().nullable(),
  model: text().nullable(),
  system_prompt: text().nullable(),
  temperature: z.number().nullable(),
  max_tokens: int().nullable(),
  human_in_the_loop: bool().nullable(),
  user_id: uuid().nullable(),
  webhook_url: text().nullable(),
  webhook_secret: text().nullable(),
  webhook_retry_count: int().nullable(),
  im_bind_dept: uuid().nullable(),
  chunk_size: int().nullable(),
  chunk_overlap: int().nullable(),
  tools: jsonb().nullable(),
  department_id: uuid().nullable(),
  monthly_token_quota: dflt(f.req(int()), 0),
  is_active: dflt(f.req(bool()), true),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
  // Phase 2 工作空间
  workspace_path: text().nullable(),
  allow_file_tools: dflt(f.req(bool()), false),
  allow_command_exec: dflt(f.req(bool()), false),
  allow_network: dflt(f.req(bool()), true),
  template_slug: text().nullable(),
  kb_id: uuid().nullable(),
  // Phase 5 审批策略
  approval_policy: jsonb().nullable(),
  // server.ts 运行时增量列
  webhook_platform: dflt(f.req(text()), 'generic'),
  risk_policy: dflt(f.req(text()), 'auto'),
  light_model: text().nullable(),
} satisfies ZodRawShape

export const departments = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  name: f.req(text()),
  is_dm: dflt(f.req(bool()), false),
  workspace_path: text().nullable(),
  artifact_review: dflt(f.req(bool()), false),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const department_members = {
  department_id: f.req(uuid()),
  agent_id: f.req(uuid()),
  role: dflt(f.req(text()), 'member'),
  joined_at: f.now(ts()),
} satisfies ZodRawShape

export const messages = {
  id: f.pk(uuid()),
  department_id: f.req(uuid()),
  sender_id: f.req(uuid()),
  content: f.req(text()),
  msg_type: dflt(f.req(text()), 'text'),
  ai_draft: text().nullable(),
  ai_approved: bool().nullable(),
  ai_step: jsonb().nullable(),
  reply_to: uuid().nullable(),
  attachments: jsonb().nullable(),
  routed_to: text().nullable(),
  created_at: f.now(ts()),
  // server.ts 运行时增量列
  feedback: text().nullable(),
  quick_replies: jsonb().nullable(),
} satisfies ZodRawShape

export const kb_documents = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  filename: f.req(text()),
  content: f.req(text()),
  chunk_count: dflt(f.req(int()), 0),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const agent_logs = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  app_id: f.req(uuid()),
  department_id: uuid().nullable(),
  messages_count: dflt(f.req(int()), 0),
  steps_count: dflt(f.req(int()), 0),
  tokens_prompt: dflt(f.req(int()), 0),
  tokens_completion: dflt(f.req(int()), 0),
  tokens_total: dflt(f.req(int()), 0),
  elapsed_ms: dflt(f.req(int()), 0),
  success: dflt(f.req(bool()), true),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const agent_runs = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  department_id: uuid().nullable(),
  orchestrator_id: uuid().nullable(),
  parent_run_id: uuid().nullable(),
  kind: dflt(f.req(text()), 'orchestration'),
  plan_json: jsonb().nullable(),
  worker_results: jsonb().nullable(),
  status: dflt(f.req(text()), 'planned'),
  request_id: text().nullable(),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const webhook_logs = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  app_id: f.req(uuid()),
  request_body: text().nullable(),
  response_body: text().nullable(),
  response_status: int().nullable(),
  elapsed_ms: dflt(f.req(int()), 0),
  success: dflt(f.req(bool()), true),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const webhook_conversations = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  conversation_id: f.req(text()),
  role: f.req(text()),
  content: f.req(text()),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const kb_chunks = {
  id: f.pk(uuid()),
  document_id: f.req(uuid()),
  agent_id: f.req(uuid()),
  content: f.req(text()),
  chunk_index: f.req(int()),
  embedding: jsonb().nullable(), // vector(1024)——内存/传输面按 json 数组
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const agent_skills = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  skill_name: f.req(text()),
  skill_dir: f.req(text()),
  enabled: dflt(f.req(bool()), true),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const role_templates = {
  id: f.pk(uuid()),
  name: f.req(text()),
  slug: f.req(text()).meta({ unique: true }),
  description: text().nullable(),
  icon: text().nullable(),
  category: dflt(f.req(text()), 'general'),
  default_system_prompt: text().nullable(),
  default_model: text().nullable(),
  default_temperature: z.number().nullable(),
  default_max_tokens: int().nullable(),
  default_allow_file_tools: bool().nullable(),
  default_allow_command_exec: bool().nullable(),
  default_workspace_hint: text().nullable(),
  default_skills: jsonb().nullable(),
  sort_order: int().nullable(),
  is_active: dflt(f.req(bool()), true),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const events = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  event: f.req(text()),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const audit_logs = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  user_id: uuid().nullable(),
  action: f.req(text()),
  target_type: text().nullable(),
  target_id: uuid().nullable(),
  detail: jsonb().nullable(),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const agent_versions = {
  id: f.pk(uuid()),
  agent_id: f.req(uuid()),
  app_id: f.req(uuid()),
  version: f.req(int()),
  snapshot: f.req(jsonb()),
  note: text().nullable(),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const group_memories = {
  department_id: f.req(uuid()).meta({ pk: true }), // 无 DEFAULT——insert 必传
  summary: text().nullable(),
  msg_count: dflt(f.req(int()), 0),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const answer_cache = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  question: f.req(text()),
  answer: f.req(text()),
  hits: dflt(f.req(int()), 0),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const skill_ratings = {
  id: f.pk(uuid()),
  skill_dir: f.req(text()),
  app_id: f.req(uuid()),
  liked: f.req(bool()),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const agent_run_states = {
  message_id: f.req(uuid()).meta({ pk: true }),
  agent_id: f.req(uuid()),
  department_id: f.req(uuid()),
  app_id: f.req(uuid()),
  steps: dflt(f.req(jsonb()), []),
  status: dflt(f.req(text()), 'running'),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const sandboxes = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  department_id: uuid().nullable(),
  name: f.req(text()),
  status: dflt(f.req(text()), 'requested'),
  mode: dflt(f.req(text()), 'persistent'),
  image: dflt(f.req(text()), 'ap-sandbox:latest'),
  network: dflt(f.req(bool()), true),
  memory_mb: dflt(f.req(int()), 1024),
  cpus: dflt(f.req(int()), 1),
  error: text().nullable(),
  workspace: text().nullable(),
  created_at: f.now(ts()),
  last_used_at: ts().nullable(),
  expires_at: ts().nullable(),
  terminated_at: ts().nullable(),
  updated_at: f.now(ts()), // W2: manager 11 处读写（reconcile/停止超时时间基）——三单源漏列——补
} satisfies ZodRawShape

export const sandbox_events = {
  id: f.pk(z.number().int()), // BIGSERIAL——DB 侧生成（DEFAULT 无——pk 默认 random 不适用）
  sandbox_id: f.req(uuid()),
  app_id: uuid().nullable(),
  type: f.req(text()),
  detail: text().nullable(),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const survey_campaigns = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  total: f.req(int()),
  concurrency: f.req(int()),
  url: dflt(f.req(text()), ''),
  retry: dflt(f.req(int()), 2),
  status: dflt(f.req(text()), 'running'),
  completed: dflt(f.req(int()), 0),
  failed: dflt(f.req(int()), 0),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const survey_campaign_runs = {
  id: f.pk(uuid()),
  campaign_id: f.req(uuid()),
  agent_id: f.req(uuid()),
  agent_name: f.req(text()),
  dept_id: f.req(uuid()),
  status: dflt(f.req(text()), 'queued'),
  attempts: dflt(f.req(int()), 0),
  started_at: ts().nullable(),
  finished_at: ts().nullable(),
  error: text().nullable(),
} satisfies ZodRawShape

export const survey_submissions = {
  id: f.req(text()).meta({ pk: true }),
  source: f.req(text()),
  age: text().nullable(),
  industry: text().nullable(),
  rating: int().nullable(),
  focus: jsonb().nullable(),
  feedback: text().nullable(),
  submitted_at: f.now(ts()),
  campaign_id: text().nullable(), // server.ts ADD COLUMN
} satisfies ZodRawShape

export const survey_answers = {
  id: f.req(int()).meta({ pk: true }), // BIGSERIAL——DB 侧生成
  source: f.req(text()),
  question: text().nullable(),
  answer: text().nullable(),
  created_at: f.now(ts()),
  campaign_id: text().nullable(),
} satisfies ZodRawShape

export const agent_memories = {
  agent_id: f.req(uuid()).meta({ pk: true }),
  content: f.req(text()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const enterprises = {
  id: f.pk(uuid()),
  name: f.req(text()),
  owner_user_id: uuid().nullable(),
  created_at: f.now(ts()),
} satisfies ZodRawShape

export const video_tasks = {
  id: f.pk(uuid()),
  app_id: f.req(uuid()),
  department_id: uuid().nullable(),
  agent_id: uuid().nullable(),
  task_id: f.req(text()),
  prompt: f.req(text()),
  status: dflt(f.req(text()), 'pending'),
  filename: f.req(text()),
  path: text().nullable(),
  error: text().nullable(),
  params: jsonb().nullable(),
  created_at: f.now(ts()),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

export const app_ai_configs = {
  app_id: f.req(uuid()).meta({ pk: true }),
  base_url: text().nullable(),
  api_key: text().nullable(),
  model: text().nullable(),
  updated_at: f.now(ts()),
} satisfies ZodRawShape

/** 表名 → shape（27 表全集——注册面单源：23 schema.sql + 4 server.ts 运行时表） */
export const SHAPES = {
  agents,
  departments,
  department_members,
  messages,
  kb_documents,
  agent_logs,
  agent_runs,
  webhook_logs,
  webhook_conversations,
  kb_chunks,
  agent_skills,
  role_templates,
  events,
  audit_logs,
  agent_versions,
  group_memories,
  answer_cache,
  skill_ratings,
  agent_run_states,
  sandboxes,
  sandbox_events,
  survey_campaigns,
  survey_campaign_runs,
  survey_submissions,
  survey_answers,
  agent_memories,
  enterprises,
  app_ai_configs,
  video_tasks,
} as const
export type ShapeName = keyof typeof SHAPES
