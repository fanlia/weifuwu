/**
 * Org — Enterprise AI Collaboration Platform
 *
 * Types and Context augmentation for the org() middleware.
 *
 * Depends on: postgres() → user() → messager()
 *
 * ```ts
 * import { org } from 'weifuwu'
 * import type { OrgAPI } from 'weifuwu'
 *
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 * app.use(org())
 *
 * // Then in a handler:
 * const tenants = await ctx.org.listTenants()
 * ```
 */

import type { Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /** Org module — Tenant / Company / Department / Agent CRUD. */
    org: import('./types.ts').OrgAPI
  }
}

// ═══════════════════════════════════════════════════════════════
// Data models
// ═══════════════════════════════════════════════════════════════

export interface Tenant {
  id: string
  name: string
  slug: string
  config: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

export interface Company {
  id: string
  tenant_id: string
  name: string
  created_at: Date
  updated_at: Date
}

export interface Department {
  id: string
  company_id: string
  name: string
  description: string | null
  avatar: string | null
  conversation_id: string | null
  created_at: Date
  updated_at: Date
  /** Number of agents in the department (convenience) */
  agent_count?: number
}

export type AgentKind = 'ai' | 'user' | 'webhook' | 'knowledge'

export interface Agent {
  id: string
  kind: AgentKind
  name: string
  avatar: string | null
  /** If kind === 'user' */
  user_id: string | null
  /** If kind === 'ai' */
  ai_config: Record<string, unknown> | null
  /** If kind === 'webhook' */
  webhook_url: string | null
  /** If kind === 'knowledge' */
  kb_id: string | null
  created_at: Date
  updated_at: Date
}

export interface DepartmentAgent {
  department_id: string
  agent_id: string
  role: 'member' | 'admin'
  alias: string | null
  joined_at: Date
}

// ═══════════════════════════════════════════════════════════════
// Input types
// ═══════════════════════════════════════════════════════════════

export interface CreateTenantInput {
  name: string
  slug: string
  config?: Record<string, unknown>
}

export interface UpdateTenantInput {
  name?: string
  slug?: string
  config?: Record<string, unknown>
}

export interface CreateCompanyInput {
  name: string
}

export interface UpdateCompanyInput {
  name?: string
}

export interface CreateDepartmentInput {
  name: string
  description?: string
  avatar?: string
}

export interface UpdateDepartmentInput {
  name?: string
  description?: string
  avatar?: string
}

export interface CreateAgentInput {
  kind: AgentKind
  name: string
  avatar?: string
  user_id?: string
  ai_config?: Record<string, unknown>
  webhook_url?: string
  kb_id?: string
}

export interface UpdateAgentInput {
  name?: string
  avatar?: string
  ai_config?: Record<string, unknown>
  webhook_url?: string
  kb_id?: string
}

// ═══════════════════════════════════════════════════════════════
// Options
// ═══════════════════════════════════════════════════════════════

export interface OrgOptions {
  /** PostgreSQL table prefix (default: '' — 'tenants', 'companies', 'departments', 'agents', 'department_agents'). */
  tablePrefix?: string
}

// ═══════════════════════════════════════════════════════════════
// Per-request API
// ═══════════════════════════════════════════════════════════════

export interface OrgAPI {
  // ── Tenants ────────────────────────────────────────────────

  /** Create a new tenant. */
  createTenant(input: CreateTenantInput): Promise<Tenant>

  /** List all tenants. */
  listTenants(): Promise<Tenant[]>

  /** Get a tenant by id. Returns null if not found. */
  getTenant(id: string): Promise<Tenant | null>

  /** Get a tenant by slug. Returns null if not found. */
  getTenantBySlug(slug: string): Promise<Tenant | null>

  /** Update a tenant. Returns updated record or null. */
  updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant | null>

  /** Delete a tenant. Returns false if not found. */
  deleteTenant(id: string): Promise<boolean>

  // ── Companies ──────────────────────────────────────────────

  /** Create a company under a tenant. */
  createCompany(tenantId: string, input: CreateCompanyInput): Promise<Company>

  /** List companies in a tenant. */
  listCompanies(tenantId: string): Promise<Company[]>

  /** Get a company by id. Returns null if not found. */
  getCompany(id: string): Promise<Company | null>

  /** Update a company. Returns updated record or null. */
  updateCompany(id: string, input: UpdateCompanyInput): Promise<Company | null>

  /** Delete a company. Returns false if not found. */
  deleteCompany(id: string): Promise<boolean>

  // ── Departments ────────────────────────────────────────────

  /** Create a department under a company. Also creates a messager conversation. */
  createDepartment(companyId: string, input: CreateDepartmentInput): Promise<Department>

  /** List departments in a company. */
  listDepartments(companyId: string): Promise<Department[]>

  /** Get a department by id. Returns null if not found. */
  getDepartment(id: string): Promise<Department | null>

  /** Update a department. Returns updated record or null. */
  updateDepartment(id: string, input: UpdateDepartmentInput): Promise<Department | null>

  /** Delete a department. Returns false if not found. */
  deleteDepartment(id: string): Promise<boolean>

  // ── Agents ─────────────────────────────────────────────────

  /** Create a new agent. */
  createAgent(input: CreateAgentInput): Promise<Agent>

  /** Get an agent by id. Returns null if not found. */
  getAgent(id: string): Promise<Agent | null>

  /** Update an agent. Returns updated record or null. */
  updateAgent(id: string, input: UpdateAgentInput): Promise<Agent | null>

  /** Delete an agent. Returns false if not found. */
  deleteAgent(id: string): Promise<boolean>

  /** List all agents (global, across all tenants/companies). */
  listAgents(): Promise<Agent[]>

  // ── Department-Agent bindings ──────────────────────────────

  /** Add an agent to a department with a role. */
  addAgentToDepartment(departmentId: string, agentId: string, role?: 'member' | 'admin'): Promise<void>

  /** Remove an agent from a department. */
  removeAgentFromDepartment(departmentId: string, agentId: string): Promise<boolean>

  /** List all agents in a department. */
  listDepartmentAgents(departmentId: string): Promise<Agent[]>

  /** Update an agent's role or alias in a department. */
  updateDepartmentAgent(departmentId: string, agentId: string, data: { role?: 'member' | 'admin'; alias?: string }): Promise<void>

  // ── Internal (for module-internal use) ────────────────────
  _getDepartmentRaw(id: string): Promise<Department | null>
  _getAgentRaw(id: string): Promise<Agent | null>
}
