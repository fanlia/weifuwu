/**
 * Org — Enterprise AI Collaboration Platform
 *
 * Depends on `postgres()`, `user()`, and `messager()` middleware registered first.
 *
 * ```ts
 * import { serve, Router, postgres, user, messager, org } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 * app.use(org())
 *
 * app.post('/api/tenants', async (req, ctx) => {
 *   const tenant = await ctx.org.createTenant(await req.json())
 *   return Response.json(tenant, { status: 201 })
 * })
 *
 * app.get('/api/tenants', async (req, ctx) => {
 *   return Response.json(await ctx.org.listTenants())
 * })
 * ```
 */

import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  OrgAPI,
  OrgOptions,
  Tenant,
  Company,
  Department,
  Agent,
  DepartmentAgent,
  CreateTenantInput,
  UpdateTenantInput,
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  CreateAgentInput,
  UpdateAgentInput,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Row mapping helpers
// ═══════════════════════════════════════════════════════════════

function toTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    config: row.config as Record<string, unknown> ?? {},
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function toCompany(row: Record<string, unknown>): Company {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

function toDepartment(row: Record<string, unknown>): Department {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string,
    description: row.description as string | null,
    avatar: row.avatar as string | null,
    conversation_id: row.conversation_id as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    agent_count: row.agent_count as number | undefined,
  }
}

function toAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    kind: row.kind as Agent['kind'],
    name: row.name as string,
    avatar: row.avatar as string | null,
    user_id: row.user_id as string | null,
    ai_config: row.ai_config as Record<string, unknown> | null,
    webhook_url: row.webhook_url as string | null,
    kb_id: row.kb_id as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

// ═══════════════════════════════════════════════════════════════
// SQL helper
// ═══════════════════════════════════════════════════════════════

function getSql(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) {
    throw new Error(
      'org() requires postgres() middleware to be registered first.',
    )
  }
  return sql
}

function getUserId(ctx: Context): string {
  const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
  if (!u?.id) throw new Error('org() requires user() middleware — ctx.user is missing')
  return u.id as string
}

// ═══════════════════════════════════════════════════════════════
// OrgModule implementation
// ═══════════════════════════════════════════════════════════════

export class OrgModule {
  private migrated = false
  private prefix: string

  constructor(opts?: OrgOptions) {
    this.prefix = opts?.tablePrefix ?? ''
  }

  // ── Table names ────────────────────────────────────────────

  private q(name: string): string {
    return `"${this.prefix}${name}"`
  }

  // ── Migration ──────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    // Tenants
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('tenants')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        config      JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('tenants_slug_idx')}
        ON ${this.q('tenants')} (slug)
    `)

    // Companies
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('companies')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES ${this.q('tenants')}(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('companies_tenant_idx')}
        ON ${this.q('companies')} (tenant_id)
    `)

    // Departments
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('departments')} (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL REFERENCES ${this.q('companies')}(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        description     TEXT,
        avatar          TEXT,
        conversation_id UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('departments_company_idx')}
        ON ${this.q('departments')} (company_id)
    `)

    // Agents (global registry)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('agents')} (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kind          TEXT NOT NULL CHECK (kind IN ('ai', 'user', 'webhook', 'knowledge')),
        name          TEXT NOT NULL,
        avatar        TEXT,
        user_id       UUID,
        ai_config     JSONB,
        webhook_url   TEXT,
        kb_id         UUID,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Department-Agent many-to-many
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.q('department_agents')} (
        department_id UUID NOT NULL REFERENCES ${this.q('departments')}(id) ON DELETE CASCADE,
        agent_id      UUID NOT NULL REFERENCES ${this.q('agents')}(id) ON DELETE CASCADE,
        role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
        alias         TEXT,
        joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (department_id, agent_id)
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('dept_agents_dept_idx')}
        ON ${this.q('department_agents')} (department_id)
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${this.q('dept_agents_agent_idx')}
        ON ${this.q('department_agents')} (agent_id)
    `)

    this.migrated = true
  }

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  // ── Per-request bound API ──────────────────────────────────

  bind(ctx: Context): OrgAPI {
    const self = this
    const sql = getSql(ctx)

    // Auto-migrate on first request
    if (!this.migrated) {
      this.migrate(sql).catch(() => {})
    }

    // Helper: get current user id (lazy — only when needed by a method)
    function getUserIdLazy(): string {
      const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
      if (!u?.id) throw new Error('org() requires user() middleware — ctx.user is missing')
      return u.id as string
    }

    // Helper: get messager from ctx
    function getMessager(): any {
      const m = (ctx as Record<string, unknown>).messager
      if (!m) throw new Error('org() requires messager() middleware — ctx.messager is missing')
      return m
    }

    return {
      // ── Tenants ──────────────────────────────────────────

      async createTenant(input: CreateTenantInput): Promise<Tenant> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('tenants')} (name, slug, config)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [input.name, input.slug, JSON.stringify(input.config ?? {})]) as unknown as Record<string, unknown>[]

        return toTenant(row)
      },

      async listTenants(): Promise<Tenant[]> {
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT * FROM ${self.q('tenants')}
          ORDER BY created_at DESC
        `) as unknown as Record<string, unknown>[]

        return rows.map(toTenant)
      },

      async getTenant(id: string): Promise<Tenant | null> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('tenants')} WHERE id = $1
        `, [id]) as unknown as Record<string, unknown>[]

        return row ? toTenant(row) : null
      },

      async getTenantBySlug(slug: string): Promise<Tenant | null> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('tenants')} WHERE slug = $1
        `, [slug]) as unknown as Record<string, unknown>[]

        return row ? toTenant(row) : null
      },

      async updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant | null> {
        await self.ensureMigrated(sql)

        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1

        if (input.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(input.name) }
        if (input.slug !== undefined) { sets.push(`slug = $${idx++}`); vals.push(input.slug) }
        if (input.config !== undefined) { sets.push(`config = $${idx++}`); vals.push(JSON.stringify(input.config)) }

        if (sets.length === 0) { const [r] = await sql.unsafe('SELECT * FROM ' + self.q('tenants') + ' WHERE id = $1', [id]); return r ? toTenant(r) : null }

        sets.push(`updated_at = NOW()`)
        vals.push(id)

        const [row] = await sql.unsafe(`
          UPDATE ${self.q('tenants')} SET ${sets.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `, vals) as unknown as Record<string, unknown>[]

        return row ? toTenant(row) : null
      },

      async deleteTenant(id: string): Promise<boolean> {
        await self.ensureMigrated(sql)

        const result = await sql.unsafe(`
          DELETE FROM ${self.q('tenants')} WHERE id = $1
        `, [id])

        return result.count > 0
      },

      // ── Companies ────────────────────────────────────────

      async createCompany(tenantId: string, input: CreateCompanyInput): Promise<Company> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('companies')} (tenant_id, name)
          VALUES ($1, $2)
          RETURNING *
        `, [tenantId, input.name]) as unknown as Record<string, unknown>[]

        return toCompany(row)
      },

      async listCompanies(tenantId: string): Promise<Company[]> {
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT * FROM ${self.q('companies')}
          WHERE tenant_id = $1
          ORDER BY created_at DESC
        `, [tenantId]) as unknown as Record<string, unknown>[]

        return rows.map(toCompany)
      },

      async getCompany(id: string): Promise<Company | null> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('companies')} WHERE id = $1
        `, [id]) as unknown as Record<string, unknown>[]

        return row ? toCompany(row) : null
      },

      async updateCompany(id: string, input: UpdateCompanyInput): Promise<Company | null> {
        await self.ensureMigrated(sql)

        if (input.name === undefined) { const [r] = await sql.unsafe('SELECT * FROM ' + self.q('companies') + ' WHERE id = $1', [id]); return r ? toCompany(r) : null }

        const [row] = await sql.unsafe(`
          UPDATE ${self.q('companies')} SET name = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `, [input.name, id]) as unknown as Record<string, unknown>[]

        return row ? toCompany(row) : null
      },

      async deleteCompany(id: string): Promise<boolean> {
        await self.ensureMigrated(sql)

        const result = await sql.unsafe(`
          DELETE FROM ${self.q('companies')} WHERE id = $1
        `, [id])

        return result.count > 0
      },

      // ── Departments ──────────────────────────────────────

      async createDepartment(companyId: string, input: CreateDepartmentInput): Promise<Department> {
        await self.ensureMigrated(sql)

        // Create messager conversation first
        const messager = getMessager()
        const conversation = await messager.createGroupConversation(input.name, [getUserIdLazy()])

        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('departments')} (company_id, name, description, avatar, conversation_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [companyId, input.name, input.description ?? null, input.avatar ?? null, conversation.id]) as unknown as Record<string, unknown>[]

        return toDepartment(row)
      },

      async listDepartments(companyId: string): Promise<Department[]> {
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT d.*,
            (SELECT COUNT(*) FROM ${self.q('department_agents')} da WHERE da.department_id = d.id) AS agent_count
          FROM ${self.q('departments')} d
          WHERE d.company_id = $1
          ORDER BY d.created_at DESC
        `, [companyId]) as unknown as Record<string, unknown>[]

        return rows.map(toDepartment)
      },

      async getDepartment(id: string): Promise<Department | null> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          SELECT d.*,
            (SELECT COUNT(*) FROM ${self.q('department_agents')} da WHERE da.department_id = d.id) AS agent_count
          FROM ${self.q('departments')} d
          WHERE d.id = $1
        `, [id]) as unknown as Record<string, unknown>[]

        return row ? toDepartment(row) : null
      },

      async updateDepartment(id: string, input: UpdateDepartmentInput): Promise<Department | null> {
        await self.ensureMigrated(sql)

        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1

        if (input.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(input.name) }
        if (input.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(input.description) }
        if (input.avatar !== undefined) { sets.push(`avatar = $${idx++}`); vals.push(input.avatar) }

        if (sets.length === 0) { const [r] = await sql.unsafe('SELECT * FROM ' + self.q('departments') + ' WHERE id = $1', [id]); return r ? toDepartment(r) : null }

        sets.push(`updated_at = NOW()`)
        vals.push(id)

        const [row] = await sql.unsafe(`
          UPDATE ${self.q('departments')} SET ${sets.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `, vals) as unknown as Record<string, unknown>[]

        return row ? toDepartment(row) : null
      },

      async deleteDepartment(id: string): Promise<boolean> {
        await self.ensureMigrated(sql)

        const result = await sql.unsafe(`
          DELETE FROM ${self.q('departments')} WHERE id = $1
        `, [id])

        return result.count > 0
      },

      // ── Agents ───────────────────────────────────────────

      async createAgent(input: CreateAgentInput): Promise<Agent> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          INSERT INTO ${self.q('agents')} (kind, name, avatar, user_id, ai_config, webhook_url, kb_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          input.kind,
          input.name,
          input.avatar ?? null,
          input.user_id ?? null,
          input.ai_config ? JSON.stringify(input.ai_config) : null,
          input.webhook_url ?? null,
          input.kb_id ?? null,
        ]) as unknown as Record<string, unknown>[]

        return toAgent(row)
      },

      async getAgent(id: string): Promise<Agent | null> {
        await self.ensureMigrated(sql)

        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('agents')} WHERE id = $1
        `, [id]) as unknown as Record<string, unknown>[]

        return row ? toAgent(row) : null
      },

      async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null> {
        await self.ensureMigrated(sql)

        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1

        if (input.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(input.name) }
        if (input.avatar !== undefined) { sets.push(`avatar = $${idx++}`); vals.push(input.avatar) }
        if (input.ai_config !== undefined) { sets.push(`ai_config = $${idx++}`); vals.push(JSON.stringify(input.ai_config)) }
        if (input.webhook_url !== undefined) { sets.push(`webhook_url = $${idx++}`); vals.push(input.webhook_url) }
        if (input.kb_id !== undefined) { sets.push(`kb_id = $${idx++}`); vals.push(input.kb_id) }

        if (sets.length === 0) { const [r] = await sql.unsafe('SELECT * FROM ' + self.q('agents') + ' WHERE id = $1', [id]); return r ? toAgent(r) : null }

        sets.push(`updated_at = NOW()`)
        vals.push(id)

        const [row] = await sql.unsafe(`
          UPDATE ${self.q('agents')} SET ${sets.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `, vals) as unknown as Record<string, unknown>[]

        return row ? toAgent(row) : null
      },

      async deleteAgent(id: string): Promise<boolean> {
        await self.ensureMigrated(sql)

        const result = await sql.unsafe(`
          DELETE FROM ${self.q('agents')} WHERE id = $1
        `, [id])

        return result.count > 0
      },

      async listAgents(): Promise<Agent[]> {
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT * FROM ${self.q('agents')}
          ORDER BY created_at DESC
        `) as unknown as Record<string, unknown>[]

        return rows.map(toAgent)
      },

      // ── Department-Agent bindings ────────────────────────

      async _getDepartmentRaw(id: string): Promise<Department | null> {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('departments')} WHERE id = $1
        `, [id]) as unknown as Record<string, unknown>[]
        return row ? toDepartment(row) : null
      },

      async _getAgentRaw(id: string): Promise<Agent | null> {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(`
          SELECT * FROM ${self.q('agents')} WHERE id = $1
        `, [id]) as unknown as Record<string, unknown>[]
        return row ? toAgent(row) : null
      },

      async addAgentToDepartment(departmentId: string, agentId: string, role: 'member' | 'admin' = 'member'): Promise<void> {
        await self.ensureMigrated(sql)
        const messager = getMessager()

        // Get department to find conversation_id
        const [deptRow] = await sql.unsafe(`
          SELECT id, conversation_id FROM ${self.q('departments')} WHERE id = $1
        `, [departmentId]) as unknown as Record<string, unknown>[]
        if (!deptRow || !deptRow.conversation_id) {
          throw new Error('Department not found or has no conversation')
        }

        // Get agent to find user_id (for user-type agents)
        const [agentRow] = await sql.unsafe(`
          SELECT id, kind, user_id FROM ${self.q('agents')} WHERE id = $1
        `, [agentId]) as unknown as Record<string, unknown>[]
        if (!agentRow) {
          throw new Error('Agent not found')
        }

        // Add to department_agents
        await sql.unsafe(`
          INSERT INTO ${self.q('department_agents')} (department_id, agent_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (department_id, agent_id) DO UPDATE SET role = $3
        `, [departmentId, agentId, role])

        // If agent is a user, add them to the messager conversation
        if (agentRow.kind === 'user' && agentRow.user_id) {
          await messager.addParticipants(deptRow.conversation_id as string, [agentRow.user_id as string])
        }
      },

      async removeAgentFromDepartment(departmentId: string, agentId: string): Promise<boolean> {
        await self.ensureMigrated(sql)
        const messager = getMessager()

        // Get department and agent info
        const [deptRow] = await sql.unsafe(`
          SELECT conversation_id FROM ${self.q('departments')} WHERE id = $1
        `, [departmentId]) as unknown as Record<string, unknown>[]

        const [agentRow] = await sql.unsafe(`
          SELECT kind, user_id FROM ${self.q('agents')} WHERE id = $1
        `, [agentId]) as unknown as Record<string, unknown>[]

        const result = await sql.unsafe(`
          DELETE FROM ${self.q('department_agents')}
          WHERE department_id = $1 AND agent_id = $2
        `, [departmentId, agentId])

        // If agent is a user, remove them from the messager conversation
        if (agentRow?.kind === 'user' && agentRow?.user_id && deptRow?.conversation_id) {
          await messager.removeParticipant(deptRow.conversation_id as string, agentRow.user_id as string)
        }

        return result.count > 0
      },

      async listDepartmentAgents(departmentId: string): Promise<Agent[]> {
        await self.ensureMigrated(sql)

        const rows = await sql.unsafe(`
          SELECT a.*, da.role, da.alias
          FROM ${self.q('agents')} a
          JOIN ${self.q('department_agents')} da ON da.agent_id = a.id
          WHERE da.department_id = $1
          ORDER BY da.joined_at ASC
        `, [departmentId]) as unknown as Record<string, unknown>[]

        return rows.map(toAgent)
      },

      async updateDepartmentAgent(departmentId: string, agentId: string, data: { role?: 'member' | 'admin'; alias?: string }): Promise<void> {
        await self.ensureMigrated(sql)

        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1

        if (data.role !== undefined) { sets.push(`role = $${idx++}`); vals.push(data.role) }
        if (data.alias !== undefined) { sets.push(`alias = $${idx++}`); vals.push(data.alias) }

        if (sets.length === 0) return

        vals.push(departmentId, agentId)

        await sql.unsafe(`
          UPDATE ${self.q('department_agents')} SET ${sets.join(', ')}
          WHERE department_id = $${idx} AND agent_id = $${idx + 1}
        `, vals)
      },
    }
  }

  // ── Middleware ─────────────────────────────────────────────

  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    ctx.org = this.bind(ctx)
    return next(req, ctx)
  }
}
