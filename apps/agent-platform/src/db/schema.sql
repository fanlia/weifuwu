-- agent-platform 数据库 DDL
-- 依赖: pgvector 扩展

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 租户 ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 用户 ───────────────────────────────────────────────────


-- ── 公司 ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Agent — 四种类型单表继承 ─────────────────────────────

DO $$ BEGIN
  CREATE TYPE agent_type AS ENUM ('ai', 'user', 'webhook', 'knowledge_base');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        agent_type NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  description TEXT,

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

  -- 知识库配置 (type='knowledge_base')
  chunk_size  INT DEFAULT 500,
  chunk_overlap INT DEFAULT 50,

  -- 工具配置
  tools       JSONB DEFAULT '[]'::JSONB, -- ToolDefinition[]

  -- 公共
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);

-- ── 部门/群组 ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_dm       BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否为单聊
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
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_agent_logs_tenant ON agent_logs(tenant_id, created_at DESC);

-- ── Webhook 调用日志 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_body    TEXT,
  response_body   TEXT,
  response_status INT,
  elapsed_ms      INT NOT NULL DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_agent ON webhook_logs(agent_id, created_at DESC);

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
  tenant_id   UUID NOT NULL,
  event       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id, event);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event, created_at DESC);

-- first_message 每租户去重（激活漏斗只记首次）
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_first_message
  ON events(tenant_id, event) WHERE event = 'first_message';
