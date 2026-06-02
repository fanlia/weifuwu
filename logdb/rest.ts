import type { Sql } from '../vendor.ts'
import type { Context } from '../types.ts'

export function createHandler(sql: Sql<{}>, tableName: string) {
  return async (req: Request, ctx: Context) => {
    const body = await req.json() as { level?: string; source?: string; message?: string; metadata?: Record<string, unknown> }
    if (!body.level || !body.source || !body.message) {
      return Response.json({ error: 'level, source, message are required' }, { status: 400 })
    }

    const metadata = body.metadata ?? {}
    if ((ctx as any).user) {
      metadata.user_id = ((ctx as any).user as any).id
    }

    const [row] = await sql`
      INSERT INTO ${sql(tableName as any)} (level, source, message, metadata)
      VALUES (${body.level}, ${body.source}, ${body.message}, ${JSON.stringify(metadata)})
      RETURNING *
    `
    if (typeof row.metadata === 'string') {
      try { row.metadata = JSON.parse(row.metadata as string) } catch {}
    }
    return Response.json(row, { status: 201 })
  }
}

export function listHandler(sql: Sql<{}>, tableName: string) {
  return async (req: Request) => {
    const url = new URL(req.url)
    const conditions: string[] = []
    const values: unknown[] = []

    const level = url.searchParams.get('level')
    if (level) {
      conditions.push(`level = $${values.length + 1}`)
      values.push(level)
    }

    const source = url.searchParams.get('source')
    if (source) {
      conditions.push(`source = $${values.length + 1}`)
      values.push(source)
    }

    const after = url.searchParams.get('after')
    if (after) {
      conditions.push(`created_at >= $${values.length + 1}`)
      values.push(after)
    }

    const before = url.searchParams.get('before')
    if (before) {
      conditions.push(`created_at < $${values.length + 1}`)
      values.push(before)
    }

    for (const [key, value] of url.searchParams) {
      if (key.startsWith('meta.')) {
        const metaKey = key.slice(5)
        conditions.push(`metadata @> $${values.length + 1}`)
        values.push({ [metaKey]: value })
      }
    }

    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

    const [countRow] = await sql.unsafe(`SELECT COUNT(*) AS total FROM "${tableName}"${where}`, values as any[])
    const total = Number((countRow as any).total)

    const rows = await sql.unsafe(
      `SELECT * FROM "${tableName}"${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      values as any[],
    )

    for (const row of rows as any[]) {
      if (typeof row.metadata === 'string') {
        try { row.metadata = JSON.parse(row.metadata) } catch {}
      }
    }

    return Response.json({ entries: rows, total })
  }
}

export function getHandler(sql: Sql<{}>, tableName: string) {
  return async (req: Request, ctx: any) => {
    const id = ctx.params?.id
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const [row] = await sql`
      SELECT * FROM ${sql(tableName as any)} WHERE id = ${parseInt(id)} LIMIT 1
    `
    if (!row) return Response.json({ error: 'not found' }, { status: 404 })
    if (typeof (row as any).metadata === 'string') {
      try { (row as any).metadata = JSON.parse((row as any).metadata as string) } catch {}
    }
    return Response.json(row)
  }
}
