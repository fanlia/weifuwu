-- agent-platform 数据库 DDL
-- 依赖: pgvector 扩展

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 应用隔离（app_id）─────────────────────────────────────
-- 应用（tenant）由框架 userSystem 的 _weifuwu_apps / _weifuwu_app_members 管理——
-- 业务表只挂 app_id 外键语义（无 REFERENCES——框架表生命周期独立，避免建表顺序依赖）。

-- ── 用户 ───────────────────────────────────────────────────


-- ── 部门/群组（直接挂 app——一个 app 就是一个产品/公司） ─────

-- ── Agent — 四种类型单表继承 ─────────────────────────────

DO $$ BEGIN
  CREATE TYPE agent_type AS ENUM ('ai', 'user', 'webhook', 'knowledge_base', 'department');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  type        agent_type NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  description TEXT,
  role_label  TEXT,                      -- AI 人格化：角色标签（如"财务分析"）
  expertise   TEXT,                      -- AI 人格化：专长描述（如"Excel/报表/预算"）

  -- AI 机器人配置
  model       TEXT,                      -- 默认 deepseek-chat
  system_prompt TEXT,                    -- AI 角色设定
  temperature FLOAT8 DEFAULT 0.7,
  max_tokens  INT DEFAULT 2048,
  human_in_the_loop BOOLEAN DEFAULT FALSE,

  -- 真实用户绑定 (type='user')
  user_id     UUID,  -- 用户 id（框架 _weifuwu_users.id，应用层保证引用）

  -- Webhook 配置 (type='webhook')
  webhook_url TEXT,
  webhook_secret TEXT,               -- HMAC 签名密钥
  webhook_retry_count INT DEFAULT 3,  -- 失败重试次数
  im_bind_dept UUID,                 -- G8 入站：IM 回调绑定的部门（IM 消息进该部门触发 AI）

  -- 知识库配置 (type='knowledge_base')
  chunk_size  INT DEFAULT 500,
  chunk_overlap INT DEFAULT 50,

  -- 工具配置
  tools       JSONB DEFAULT '[]'::JSONB, -- ToolDefinition[]

  -- 组织层级（type='department' 部门经理——代表部门对外协作，可加入上级部门）
  department_id UUID,                    -- 代表哪个部门（1 部门 1 经理；同 app）

  -- 配额（Wave 9 成本控制——月 token 上限，0 = 不限）
  monthly_token_quota INT NOT NULL DEFAULT 0,

  -- 公共
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_app ON agents(app_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);

-- ── 部门/群组 ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  is_dm       BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否为单聊
  workspace_path TEXT,                       -- 自定义工作目录（三层模型：部门=工作目录；默认 {root}/{id}）
  artifact_review BOOLEAN NOT NULL DEFAULT FALSE,  -- 产物审批模式：AI 新产物先入 .pending 待审区
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 部门-成员关联（多对多）
CREATE TABLE IF NOT EXISTS department_members (
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (department_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_agent ON department_members(agent_id);

-- ── 消息 ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  msg_type      TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'image' | 'system'
  -- AI 相关
  ai_draft      TEXT,                          -- human-in-the-loop 草稿
  ai_approved   BOOLEAN,                      -- null=待审批, true=已批准, false=已拒绝
  ai_step       JSONB,                        -- agent step 快照
  -- 元数据
  reply_to      UUID REFERENCES messages(id) ON DELETE SET NULL,
  attachments   JSONB,                        -- [{name, path, size, ext}]（P1-3 聊天附件）
  routed_to     TEXT,                         -- O8 意图路由：本消息由语义路由派给的目标 Agent 名（null=未路由/直发）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_department ON messages(department_id, created_at);

-- ── 知识库文档 ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  content     TEXT NOT NULL,
  chunk_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_agent ON kb_documents(agent_id);

-- ── Agent 执行日志 ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  app_id          UUID NOT NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  messages_count  INT NOT NULL DEFAULT 0,
  steps_count     INT NOT NULL DEFAULT 0,
  tokens_prompt   INT NOT NULL DEFAULT 0,
  tokens_completion INT NOT NULL DEFAULT 0,
  tokens_total    INT NOT NULL DEFAULT 0,
  elapsed_ms      INT NOT NULL DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_app ON agent_logs(app_id, created_at DESC);
-- O11 编排任务树（Wave 3）：runs 表（父→子任务链）+ agent_logs 父链列
CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  orchestrator_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  parent_run_id   UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'orchestration',  -- orchestration | worker
  plan_json       JSONB,                                  -- 编排计划（子任务清单存根）
  worker_results  JSONB,                                  -- worker 结果/错误（部分完成标注）
  status          TEXT NOT NULL DEFAULT 'planned',        -- planned→running→partial→done→failed
  request_id      TEXT,                                   -- 三端事件流关联键
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_app ON agent_runs(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parent_run_id);

-- ── Webhook 调用日志 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  app_id          UUID NOT NULL,
  request_body    TEXT,
  response_body   TEXT,
  response_status INT,
  elapsed_ms      INT NOT NULL DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_agent ON webhook_logs(agent_id, created_at DESC);

-- ── Webhook 会话记忆（B1：conversation_id 多轮上下文） ──
CREATE TABLE IF NOT EXISTS webhook_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_conv ON webhook_conversations(agent_id, conversation_id, created_at);

-- ── 文档块（带向量） ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding   vector(1024),              -- DashScope text-embedding-v4 输出 1024 维
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_agent ON kb_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── Phase 1: 技能注册表 ───────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_name  TEXT NOT NULL,
  skill_dir   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);

-- ── Phase 2: 工作空间 ─────────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_path TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS allow_file_tools BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS allow_command_exec BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS allow_network BOOLEAN NOT NULL DEFAULT TRUE; -- 默认可访问网络（agent-browser 填问卷等需网络——用户决策）
ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_slug TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS kb_id UUID;

-- ── Phase 3: 角色模板 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  default_system_prompt TEXT,
  default_model TEXT,
  default_temperature FLOAT8 DEFAULT 0.7,
  default_max_tokens INT DEFAULT 2048,
  default_allow_file_tools BOOLEAN DEFAULT FALSE,
  default_allow_command_exec BOOLEAN DEFAULT FALSE,
  default_workspace_hint TEXT,
  default_skills JSONB DEFAULT '[]'::JSONB,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Phase 5: 审批策略 ─────────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS approval_policy JSONB DEFAULT '{}'::JSONB;

-- ── Phase 6: 激活漏斗埋点 ─────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  event       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_app ON events(app_id, event);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event, created_at DESC);

-- first_message 每租户去重（激活漏斗只记首次）
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_first_message
  ON events(app_id, event) WHERE event = 'first_message';

-- ── 审计日志（Wave 9——安全/合规：登录/Agent 变更/审批操作） ─────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  user_id     UUID,
  action      TEXT NOT NULL,          -- login_success / login_fail / agent_create / agent_update / agent_delete / approval
  target_type TEXT,                   -- agent / department / message
  target_id   UUID,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_app ON audit_logs(app_id, created_at DESC);

-- ── Agent 配置版本（Wave 9 版本管理：快照/回滚） ─────────────────

CREATE TABLE IF NOT EXISTS agent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  app_id      UUID NOT NULL,
  version     INT NOT NULL,
  snapshot    JSONB NOT NULL,          -- 完整配置快照（system_prompt/model/tools/...）
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version)
);
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id, version DESC);

-- ── 群共识记忆（P4——群级摘要，AI 记得群里决定过什么） ──────
CREATE TABLE IF NOT EXISTS group_memories (
  department_id UUID PRIMARY KEY,
  summary       TEXT,
  msg_count     INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── C5 答案缓存（相似问题零 token 秒回——降本增效） ──────
CREATE TABLE IF NOT EXISTS answer_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  hits        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answer_cache_app ON answer_cache(app_id);

-- ── C6 技能市场：租户级技能评分（like/dislike——聚合好评率） ──
CREATE TABLE IF NOT EXISTS skill_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_dir   TEXT NOT NULL,
  app_id      UUID NOT NULL,
  liked       BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_dir, app_id)
);
CREATE INDEX IF NOT EXISTS idx_skill_ratings_dir ON skill_ratings(skill_dir);

-- ── C1 断点续跑：流式执行步骤持久化（中断后可从中断处继续） ──
CREATE TABLE IF NOT EXISTS agent_run_states (
  message_id    UUID PRIMARY KEY,
  agent_id      UUID NOT NULL,
  department_id UUID NOT NULL,
  app_id        UUID NOT NULL,
  steps         JSONB NOT NULL DEFAULT '[]'::JSONB,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | done | failed
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 三层模型：sandbox = 计算资源（一级概念，2026-12 用户决策） ──
-- 归属：绑定部门（1 部门 = 1 目录 = 1 环境）；可空 = 独立沙盒
-- 状态机：requested（记录已建，容器未起）→ running ⇄ stopped → terminated；error（失败持久化）
-- 配置快照（image/network/memory/cpus）——漂移重建依据（配置即声明）
CREATE TABLE IF NOT EXISTS sandboxes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL,
  department_id UUID,                          -- 绑定部门（核心归属；可空=独立沙盒）
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested',  -- requested/running/stopped/terminated/error
  mode        TEXT NOT NULL DEFAULT 'persistent', -- persistent/ephemeral
  image       TEXT NOT NULL DEFAULT 'ap-sandbox:latest',
  network     BOOLEAN NOT NULL DEFAULT TRUE, -- 默认可访问网络（用户决策）
  memory_mb   INT NOT NULL DEFAULT 1024,
  cpus        INT NOT NULL DEFAULT 1,
  error       TEXT,
  workspace   TEXT,                            -- 宿主 workspace 路径（卷挂载源）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                    -- heartbeat（DB 持久化——重启可恢复）
  expires_at  TIMESTAMPTZ,                     -- 寿命上限（超龄重建）
  terminated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sandboxes_dept ON sandboxes(department_id);
-- 沙盒事件日志（2026-12 可观测性：生命周期 + exec 追踪——debug 问卷并发等场景）
CREATE TABLE IF NOT EXISTS sandbox_events (
  id          BIGSERIAL PRIMARY KEY,
  sandbox_id  UUID NOT NULL,
  app_id      UUID,
  type        TEXT NOT NULL,   -- created/started/stopped/terminated/evicted/exec_start/exec_done/exec_timeout/exec_error/quota_rejected
  detail      TEXT,            -- 工具名/错误/超时秒数等
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_events_sb ON sandbox_events(sandbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandboxes_status ON sandboxes(status, last_used_at);
-- 1 部门 = 1 环境（部分唯一索引——terminated 后允许重建；NULL=独立沙盒不冲突）
CREATE UNIQUE INDEX IF NOT EXISTS idx_sandboxes_dept_active ON sandboxes(department_id)
  WHERE department_id IS NOT NULL AND status != 'terminated';
