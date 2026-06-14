import { z } from 'zod'
import type { Sql } from '../vendor.ts'
import type { Context } from '../types.ts'
import { Router } from '../router.ts'
import type { FieldDef, UserTableRow } from './types.ts'
import {
  internalTableName, validateSlug, validateFieldDefs, getRelationFields, findRelation,
} from './utils.ts'
import { createTableSQL, addColumnSQL, dropTableSQL, createIndexesSQL } from './schema.ts'

// ── Type-safe helpers for dynamic-table patterns ───────────────────────────

/** Extract user ID from context (user middleware may or may not be present). */
function userId(ctx: Context): number | null {
  return ((ctx as Context & { user?: { id?: number } }).user?.id) ?? null
}

/** Extract typed `count` from a SQL count result row. */
function extractCount(rows: unknown[]): number {
  return Number((rows[0] as Record<string, unknown>)?.count ?? 0)
}

/** Cast an object for JSONB insertion (satisfies postgres.js JSONB typing). */
function asJson<T>(val: T): T {
  return val
}

/** Cast a table name for use with `sql()` tag (dynamic names can't be typed). */
function tableRef(s: Sql<{}>, name: string) {
  return (s as any)(name)
}

/** Add tenant_id to a parsed record before insert. */
function withTenant<T extends Record<string, unknown>>(ctx: Context, data: T): T & { tenant_id: string } {
  ;(data as Record<string, unknown>).tenant_id = ctx.tenant!.id
  return data as T & { tenant_id: string }
}

/** Remove tenant_id from a parsed record before update (can't change tenant). */
function withoutTenant<T extends Record<string, unknown>>(data: T): T {
  delete (data as Record<string, unknown>).tenant_id
  return data
}

function zodType(field: FieldDef): z.ZodTypeAny {
  let t: z.ZodTypeAny
  switch (field.type) {
    case 'integer':
      t = z.number().int()
      break
    case 'float':
      t = z.number()
      break
    case 'boolean':
      t = z.boolean()
      break
    case 'enum':
      t = field.options && field.options.length > 0
        ? z.enum(field.options as [string, ...string[]])
        : z.string()
      break
    case 'json':
      t = z.record(z.string(), z.unknown())
      break
    case 'vector':
      t = z.array(z.number())
      break
    default:
      t = z.string()
  }
  if (!field.required) {
    if (field.default !== undefined) {
      t = t.default(field.default)
    } else {
      t = t.optional()
    }
  }
  return t
}

async function getUserTable(sql: Sql<{}>, tenantId: string, slug: string): Promise<UserTableRow | null> {
  const [row] = await sql`
    SELECT * FROM "_user_tables"
    WHERE tenant_id = ${tenantId} AND slug = ${slug}
    LIMIT 1
  `
  return (row as UserTableRow) ?? null
}

function requireAdmin(ctx: Context): Response | null {
  if (ctx.tenant?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export function buildRouter(sql: Sql<{}>, usersTable: string): Router {
  const r = new Router()

  // ── Tenants ──────────────────────────────────────────────

  r.post('/sys/tenants', async (req: Request, ctx: Context) => {
    const { name } = await req.json() as { name: string }
    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'name is required' }, { status: 400 })
    }
    const [tenant] = await sql`
      INSERT INTO "_tenants" ("name") VALUES (${name}) RETURNING *
    `
    await sql`
      INSERT INTO "_tenant_members" ("tenant_id", "user_id", "role")
      VALUES (${(tenant as Record<string, unknown>).id as number}, ${userId(ctx)}, 'admin')
    `
    return Response.json(tenant, { status: 201 })
  })

  r.get('/sys/tenants', async (_req: Request, ctx: Context) => {
    const rows = await sql`
      SELECT t.*, tm.role FROM "_tenants" t
      JOIN "_tenant_members" tm ON tm.tenant_id = t.id
      WHERE tm.user_id = ${userId(ctx)}
    `
    return Response.json(rows)
  })

  r.post('/sys/tenants/invite', async (req: Request, ctx: Context) => {
    const err = requireAdmin(ctx)
    if (err) return err
    const { email, role = 'member' } = await req.json() as { email: string; role?: string }
    const [user] = await sql`
      SELECT id FROM ${tableRef(sql, usersTable)} WHERE "email" = ${email} LIMIT 1
    `
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 })
    const [existing] = await sql`
      SELECT id FROM "_tenant_members"
      WHERE tenant_id = ${ctx.tenant!.id} AND user_id = ${(user as Record<string, unknown>).id as number} LIMIT 1
    `
    if (existing) return Response.json({ error: 'Already a member' }, { status: 409 })
    await sql`
      INSERT INTO "_tenant_members" ("tenant_id", "user_id", "role")
      VALUES (${ctx.tenant!.id}, ${(user as Record<string, unknown>).id as number}, ${role})
    `
    return Response.json({ ok: true }, { status: 201 })
  })

  r.delete('/sys/tenants/members/:userId', async (req: Request, ctx: Context) => {
    const err = requireAdmin(ctx)
    if (err) return err
    const userId = parseInt(ctx.params.userId, 10)
    await sql`
      DELETE FROM "_tenant_members"
      WHERE tenant_id = ${ctx.tenant!.id} AND user_id = ${userId}
    `
    return Response.json({ ok: true })
  })

  // ── Tables ───────────────────────────────────────────────

  r.post('/sys/tables', async (req: Request, ctx: Context) => {
    const err = requireAdmin(ctx)
    if (err) return err
    const body = await req.json() as { slug: string; label?: string; fields: FieldDef[] }
    const slugErr = validateSlug(body.slug)
    if (slugErr) return Response.json({ error: slugErr }, { status: 400 })
    const fieldErrs = validateFieldDefs(body.fields)
    if (fieldErrs.length) {
      return Response.json({ error: 'Invalid fields', details: fieldErrs }, { status: 400 })
    }
    const [existing] = await sql`
      SELECT id FROM "_user_tables"
      WHERE tenant_id = ${ctx.tenant!.id} AND slug = ${body.slug} LIMIT 1
    `
    if (existing) return Response.json({ error: 'Table already exists' }, { status: 409 })

    const createSQL = createTableSQL(ctx.tenant!.id, body.slug, body.fields)
    await sql.unsafe(createSQL)
    for (const stmt of createIndexesSQL(ctx.tenant!.id, body.slug, body.fields)) {
      await sql.unsafe(stmt)
    }

    const [row] = await sql`
      INSERT INTO "_user_tables" ("tenant_id", "slug", "label", "fields")
      VALUES (${ctx.tenant!.id}, ${body.slug}, ${body.label || ''}, ${asJson(body.fields) as any})
      RETURNING *
    `
    return Response.json(row, { status: 201 })
  })

  r.get('/sys/tables', async (_req: Request, ctx: Context) => {
    const rows = await sql`
      SELECT * FROM "_user_tables"
      WHERE tenant_id = ${ctx.tenant!.id}
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  })

  r.get('/sys/tables/:slug', async (_req: Request, ctx: Context) => {
    const table = await getUserTable(sql, ctx.tenant!.id, ctx.params.slug)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })
    return Response.json(table)
  })

  r.patch('/sys/tables/:slug', async (req: Request, ctx: Context) => {
    const err = requireAdmin(ctx)
    if (err) return err
    const body = await req.json() as { fields?: FieldDef[] }
    if (!body.fields || !Array.isArray(body.fields)) {
      return Response.json({ error: 'fields array required' }, { status: 400 })
    }
    const table = await getUserTable(sql, ctx.tenant!.id, ctx.params.slug)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })

    const existingNames = new Set(table.fields.map((f: FieldDef) => f.name))
    const newFields = body.fields.filter((f: FieldDef) => !existingNames.has(f.name))

    for (const f of newFields) {
      await sql.unsafe(addColumnSQL(ctx.tenant!.id, ctx.params.slug, f))
    }
    const merged = [...table.fields, ...newFields]
    await sql`
      UPDATE "_user_tables"
      SET fields = ${asJson(merged) as any}
      WHERE id = ${table.id}
    `
    return Response.json({ ...table, fields: merged })
  })

  r.delete('/sys/tables/:slug', async (_req: Request, ctx: Context) => {
    const err = requireAdmin(ctx)
    if (err) return err
    await sql.unsafe(dropTableSQL(ctx.tenant!.id, ctx.params.slug))
    await sql`
      DELETE FROM "_user_tables"
      WHERE tenant_id = ${ctx.tenant!.id} AND slug = ${ctx.params.slug}
    `
    return Response.json({ ok: true })
  })

  // ── Data CRUD ────────────────────────────────────────────

  async function resolveTable(ctx: Context): Promise<UserTableRow | null> {
    return getUserTable(sql, ctx.tenant!.id, ctx.params['_slug'])
  }

  function internalName(ctx: Context): string {
    return internalTableName(ctx.tenant!.id, ctx.params['_slug'])
  }

  r.get('/:_slug', async (req: Request, ctx: Context) => {
    const table = await resolveTable(ctx)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const sort = url.searchParams.get('sort') || '-id'
    const orderDir = sort.startsWith('-') ? 'DESC' : 'ASC'
    const orderCol = sort.replace(/^-/, '')

    // Vector search
    const searchVector = url.searchParams.get('search_vector')
    if (searchVector) {
      const searchField = url.searchParams.get('search_field') || ''
      const searchDistance = url.searchParams.get('search_distance') || 'cosine'
      const operator = searchDistance === 'l2' ? '<->' : searchDistance === 'ip' ? '<#>' : '<=>'
      const name = internalName(ctx)
      try {
        const parsed = JSON.parse(searchVector) as number[]
        const [rows, countResult] = await Promise.all([
          sql.unsafe(
            `SELECT *, "${searchField}" ${operator} $1::vector AS "_distance" FROM "${name}" WHERE tenant_id = $2 ORDER BY "_distance" LIMIT $3 OFFSET $4`,
            [parsed, ctx.tenant!.id, limit, offset],
          ),
          sql.unsafe(
            `SELECT count(*) as count FROM "${name}" WHERE tenant_id = $1`,
            [ctx.tenant!.id],
          ),
        ])
        return Response.json({ rows, count: extractCount(countResult) })
      } catch {
        return Response.json({ error: 'Invalid search_vector' }, { status: 400 })
      }
    }

    const name = internalName(ctx)
    const [rows, countResult] = await Promise.all([
      sql.unsafe(
        `SELECT * FROM "${name}" WHERE tenant_id = $1 ORDER BY "${orderCol}" ${orderDir} LIMIT $2 OFFSET $3`,
        [ctx.tenant!.id, limit, offset],
      ),
      sql.unsafe(
        `SELECT count(*) as count FROM "${name}" WHERE tenant_id = $1`,
        [ctx.tenant!.id],
      ),
    ])
    return Response.json({ rows, count: extractCount(countResult) })
  })

  r.post('/:_slug', async (req: Request, ctx: Context) => {
    const table = await resolveTable(ctx)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })

    const data = await req.json() as Record<string, unknown>
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const f of table.fields) {
      shape[f.name] = zodType(f)
    }
    const zodSchema = z.object(shape)
    const parsed = withTenant(ctx, zodSchema.parse(data) as Record<string, unknown>)
    delete parsed.id

    const name = internalName(ctx)
    const [row] = await sql`INSERT INTO ${tableRef(sql, name)} ${sql(parsed as Record<string, unknown>)} RETURNING *`
    return Response.json(row, { status: 201 })
  })

  r.get('/:_slug/:id', async (_req: Request, ctx: Context) => {
    const table = await resolveTable(ctx)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })

    const name = internalName(ctx)
    const [row] = await sql`
      SELECT * FROM ${tableRef(sql, name)}
      WHERE id = ${parseInt(ctx.params.id, 10)} AND tenant_id = ${ctx.tenant!.id}
      LIMIT 1
    `
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(row)
  })

  r.patch('/:_slug/:id', async (req: Request, ctx: Context) => {
    const table = await resolveTable(ctx)
    if (!table) return Response.json({ error: 'Table not found' }, { status: 404 })

    const data = await req.json() as Record<string, unknown>
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const f of table.fields) {
      shape[f.name] = zodType(f)
    }
    const zodSchema = z.object(shape).partial()
    const parsed = withoutTenant(zodSchema.parse(data) as Record<string, unknown>)
    delete parsed.id

    if (Object.keys(parsed).length === 0) {
      const name = internalName(ctx)
      const [row] = await sql`
        SELECT * FROM ${tableRef(sql, name)}
        WHERE id = ${parseInt(ctx.params.id, 10)} AND tenant_id = ${ctx.tenant!.id}
        LIMIT 1
      `
      return Response.json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 })
    }

    const name = internalName(ctx)
    const [row] = await sql`
      UPDATE ${tableRef(sql, name)} SET ${sql(parsed as Record<string, unknown>)}
      WHERE id = ${parseInt(ctx.params.id, 10)} AND tenant_id = ${ctx.tenant!.id}
      RETURNING *
    `
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(row)
  })

  r.delete('/:_slug/:id', async (_req: Request, ctx: Context) => {
    const name = internalName(ctx)
    const result = await sql`
      DELETE FROM ${tableRef(sql, name)}
      WHERE id = ${parseInt(ctx.params.id, 10)} AND tenant_id = ${ctx.tenant!.id}
      RETURNING 1
    `
    if ((result as { length: number }).length === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    return Response.json({ ok: true })
  })

  // ── Nested routes ─────────────────────────────────────────

  async function handleNested(req: Request, ctx: Context, method: 'GET' | 'POST'): Promise<Response> {
    const [parentTable, nestedSlug] = await Promise.all([
      getUserTable(sql, ctx.tenant!.id, ctx.params['_slug']),
      ctx.params['_nested'],
    ])
    if (!parentTable) return Response.json({ error: 'Parent table not found' }, { status: 404 })

    const childTable = await getUserTable(sql, ctx.tenant!.id, nestedSlug)
    if (!childTable) return Response.json({ error: 'Nested table not found' }, { status: 404 })

    // Find relation field on child table pointing to parent
    const relField = findRelation(childTable.fields, ctx.params['_slug'])
    if (!relField) {
      return Response.json({ error: `No relation from "${nestedSlug}" to "${ctx.params['_slug']}"` }, { status: 400 })
    }

    // M2M: check if child is a junction table with exactly two relation fields
    const relFields = getRelationFields(childTable.fields)
    if (relFields.length === 2) {
      // Junction table — bypass to the target table
      const otherRel = relFields.find(f => f.name !== relField.name)!
      const targetSlug = otherRel.relation!.table
      const targetTable = await getUserTable(sql, ctx.tenant!.id, targetSlug)
      if (!targetTable) return Response.json({ error: 'Target table not found' }, { status: 404 })

      const childName = internalTableName(ctx.tenant!.id, nestedSlug)
      const targetName = internalTableName(ctx.tenant!.id, targetSlug)
      const parentId = parseInt(ctx.params.id, 10)

      if (method === 'GET') {
        const [rows, countResult] = await Promise.all([
          sql.unsafe(
            `SELECT t.* FROM "${targetName}" t JOIN "${childName}" j ON j."${otherRel.name}" = t.id WHERE j."${relField.name}" = $1 AND t.tenant_id = $2 ORDER BY t.id DESC`,
            [parentId, ctx.tenant!.id],
          ),
          sql.unsafe(
            `SELECT count(*) as count FROM "${targetName}" t JOIN "${childName}" j ON j."${otherRel.name}" = t.id WHERE j."${relField.name}" = $1 AND t.tenant_id = $2`,
            [parentId, ctx.tenant!.id],
          ),
        ])
        return Response.json({ rows, count: extractCount(countResult) })
      }
      return Response.json({ error: 'POST not supported on M2M nested routes' }, { status: 400 })
    }

    // Simple belongs_to
    const childName = internalTableName(ctx.tenant!.id, nestedSlug)
    const parentId = parseInt(ctx.params.id, 10)

    if (method === 'GET') {
      const [rows, countResult] = await Promise.all([
        sql.unsafe(
          `SELECT * FROM "${childName}" WHERE "${relField.name}" = $1 AND tenant_id = $2 ORDER BY id DESC`,
          [parentId, ctx.tenant!.id],
        ),
        sql.unsafe(
          `SELECT count(*) as count FROM "${childName}" WHERE "${relField.name}" = $1 AND tenant_id = $2`,
          [parentId, ctx.tenant!.id],
        ),
      ])
      return Response.json({ rows, count: extractCount(countResult) })
    }

    // POST: create child row with relation field pre-filled
    const body = await req.json() as Record<string, unknown>
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const f of childTable.fields) {
      shape[f.name] = zodType(f)
    }
    const zodSchema = z.object(shape)
    const parsed = zodSchema.parse(body) as Record<string, unknown>
    ;(parsed as Record<string, unknown>).tenant_id = ctx.tenant!.id
    ;(parsed as Record<string, unknown>)[relField.name] = parentId
    delete parsed.id

    const [row] = await sql`INSERT INTO ${tableRef(sql, childName)} ${sql(parsed as Record<string, unknown>)} RETURNING *`
    return Response.json(row, { status: 201 })
  }

  r.get('/:_slug/:id/:_nested', async (req, ctx) => handleNested(req, ctx, 'GET'))
  r.post('/:_slug/:id/:_nested', async (req, ctx) => handleNested(req, ctx, 'POST'))

  return r
}
