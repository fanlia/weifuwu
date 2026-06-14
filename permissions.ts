import type { Sql } from './vendor.ts'
import type { Middleware, Context, Handler } from './types.ts'

// ── Context augmentation ─────────────────────────────────────────────────────

declare module './types.ts' {
  interface Context {
    permissions: { roles: Set<string>; permissions: Set<string> }
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface PermissionsOptions {
  /** PostgreSQL client. */
  pg: { sql: Sql<{}> }
  /** Table prefix (default: '' → _roles, _user_roles, _role_permissions). */
  prefix?: string
}

export interface PermissionsModule extends Middleware {
  /**
   * Middleware that injects `ctx.permissions = { roles, permissions }`.
   * Reads `ctx.user.id` to look up role assignments.
   * Must be placed after a middleware that sets `ctx.user`.
   */
  (req: Request, ctx: Context, next: Handler): Response | Promise<Response>

  /** Assign a role to a user. Creates the role if it doesn't exist. */
  assignRole(userId: number, role: string): Promise<void>
  /** Remove a role from a user. */
  removeRole(userId: number, role: string): Promise<void>
  /** Grant a permission to a role. Creates the role if it doesn't exist. */
  grantPermission(role: string, permission: string): Promise<void>
  /** Revoke a permission from a role. */
  revokePermission(role: string, permission: string): Promise<void>
  /** Get all roles assigned to a user. */
  getUserRoles(userId: number): Promise<string[]>
  /** Get all permissions for a user (union of all role permissions). */
  getUserPermissions(userId: number): Promise<string[]>

  /**
   * Middleware that rejects the request if the user does not have any of the specified roles.
   * Must be placed after `permissions()` middleware (which injects ctx.permissions.roles).
   */
  requireRole(...roles: string[]): Middleware<Context, Context>
  /**
   * Middleware that rejects the request if the user does not have all specified permissions.
   * Must be placed after `permissions()` middleware (which injects ctx.permissions.permissions).
   */
  requirePermission(...permissions: string[]): Middleware<Context, Context>

  /** Create the underlying tables. Safe to call multiple times. */
  migrate(): Promise<void>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function permissions(options: PermissionsOptions): PermissionsModule {
  const { pg } = options
  const sql = pg.sql
  const prefix = options.prefix ?? ''
  const rolesTable = `${prefix}_roles`
  const rolePermsTable = `${prefix}_role_permissions`
  const userRolesTable = `${prefix}_user_roles`

  async function migrate(): Promise<void> {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${escapeIdent(rolesTable)} (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${escapeIdent(rolePermsTable)} (
        id SERIAL PRIMARY KEY,
        role_id INTEGER NOT NULL REFERENCES ${escapeIdent(rolesTable)}(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(role_id, permission)
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${escapeIdent(userRolesTable)} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL REFERENCES ${escapeIdent(rolesTable)}(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, role_id)
      )
    `)
  }

  async function ensureRole(role: string): Promise<number> {
    const [existing] = await sql.unsafe(
      `SELECT id FROM ${escapeIdent(rolesTable)} WHERE name = $1 LIMIT 1`,
      [role],
    ) as Array<{ id: number }>
    if (existing) return existing.id

    const [created] = await sql.unsafe(
      `INSERT INTO ${escapeIdent(rolesTable)} (name) VALUES ($1) RETURNING id`,
      [role],
    ) as Array<{ id: number }>
    return created.id
  }

  async function assignRole(userId: number, role: string): Promise<void> {
    const roleId = await ensureRole(role)
    await sql.unsafe(
      `INSERT INTO ${escapeIdent(userRolesTable)} (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleId],
    )
  }

  async function removeRole(userId: number, role: string): Promise<void> {
    await sql.unsafe(
      `DELETE FROM ${escapeIdent(userRolesTable)} WHERE user_id = $1 AND role_id = (SELECT id FROM ${escapeIdent(rolesTable)} WHERE name = $2)`,
      [userId, role],
    )
  }

  async function grantPermission(role: string, permission: string): Promise<void> {
    const roleId = await ensureRole(role)
    await sql.unsafe(
      `INSERT INTO ${escapeIdent(rolePermsTable)} (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roleId, permission],
    )
  }

  async function revokePermission(role: string, permission: string): Promise<void> {
    await sql.unsafe(
      `DELETE FROM ${escapeIdent(rolePermsTable)} WHERE role_id = (SELECT id FROM ${escapeIdent(rolesTable)} WHERE name = $1) AND permission = $2`,
      [role, permission],
    )
  }

  async function getUserRoles(userId: number): Promise<string[]> {
    const rows = await sql.unsafe(
      `SELECT r.name FROM ${escapeIdent(userRolesTable)} ur
       JOIN ${escapeIdent(rolesTable)} r ON r.id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY r.name`,
      [userId],
    ) as Array<{ name: string }>
    return rows.map(r => r.name)
  }

  async function getUserPermissions(userId: number): Promise<string[]> {
    const rows = await sql.unsafe(
      `SELECT DISTINCT rp.permission FROM ${escapeIdent(userRolesTable)} ur
       JOIN ${escapeIdent(rolePermsTable)} rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY rp.permission`,
      [userId],
    ) as Array<{ permission: string }>
    return rows.map(r => r.permission)
  }

  // ── Middleware ──

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    const userId = (ctx.user as { id?: number } | undefined)?.id
    let roles = new Set<string>()
    let perms = new Set<string>()

    if (userId) {
      const userRoles = await getUserRoles(userId)
      const userPerms = userId ? await getUserPermissions(userId) : []

      roles = new Set(userRoles)
      perms = new Set(userPerms)

      // Support wildcard: role with '*' permission grants everything
      const hasWildcard = userPerms.includes('*')
      if (hasWildcard) {
        perms = new Set(['*'])  // marker, not exhaustive
      }
    }

    ctx.permissions = { roles, permissions: perms }
    return next(req, ctx)
  }) as unknown as PermissionsModule

  // ── Guard middleware factories ──

  function requireRole(...roles: string[]): Middleware<Context, Context> {
    return (req, ctx, next) => {
      const p = ctx as Context & { permissions: { roles: Set<string>; permissions: Set<string> } }
      if (!p.permissions?.roles || !roles.some((r: string) => p.permissions.roles.has(r))) {
        return Response.json(
          { error: `Forbidden: requires one of roles [${roles.join(', ')}]` },
          { status: 403 },
        )
      }
      return next(req, ctx)
    }
  }

  function requirePermission(...perms: string[]): Middleware<Context, Context> {
    return (req, ctx, next) => {
      const p = ctx as Context & { permissions: { roles: Set<string>; permissions: Set<string> } }
      const userPerms = p.permissions?.permissions
      if (!userPerms) {
        return Response.json({ error: 'Forbidden: no permissions loaded' }, { status: 403 })
      }
      if (userPerms.has('*')) return next(req, ctx)
      const missing = perms.filter((p: string) => !userPerms.has(p))
      if (missing.length > 0) {
        return Response.json(
          { error: `Forbidden: missing permissions [${missing.join(', ')}]` },
          { status: 403 },
        )
      }
      return next(req, ctx)
    }
  }

  // ── Attach extra methods ──

  mw.assignRole = assignRole
  mw.removeRole = removeRole
  mw.grantPermission = grantPermission
  mw.revokePermission = revokePermission
  mw.getUserRoles = getUserRoles
  mw.getUserPermissions = getUserPermissions
  mw.requireRole = requireRole
  mw.requirePermission = requirePermission
  mw.migrate = migrate

  return mw
}
