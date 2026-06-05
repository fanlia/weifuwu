import { eq, gte, lt, contains } from '../postgres/schema/index.ts'
import type { BoundTable, SQL } from '../postgres/schema/index.ts'
import type { Context } from '../types.ts'
import type { LogEntryInput } from './types.ts'

function parseMetadata(row: any): any {
  if (typeof row.metadata === 'string') {
    try { row.metadata = JSON.parse(row.metadata) } catch {}
  }
  return row
}

export function createHandler(entries: BoundTable<any>) {
  return async (req: Request, ctx: Context) => {
    const body = await req.json() as LogEntryInput
    if (!body.level || !body.source || !body.message) {
      return Response.json({ error: 'level, source, message are required' }, { status: 400 })
    }

    const metadata = body.metadata ?? {}
    if ((ctx as any).user) {
      metadata.user_id = ((ctx as any).user as any).id
    }

    const row = await entries.insert({
      level: body.level,
      source: body.source,
      message: body.message,
      metadata,
    } as any)

    return Response.json(parseMetadata(row), { status: 201 })
  }
}

export function listHandler(entries: BoundTable<any>) {
  return async (req: Request) => {
    const url = new URL(req.url)
    const conditions: SQL[] = []

    const level = url.searchParams.get('level')
    if (level) conditions.push(eq('level', level))

    const source = url.searchParams.get('source')
    if (source) conditions.push(eq('source', source))

    for (const [key, value] of url.searchParams) {
      if (key.startsWith('meta.')) {
        conditions.push(contains('metadata', { [key.slice(5)]: value }))
      }
    }

    const after = url.searchParams.get('after')
    if (after) conditions.push(gte('created_at', after))

    const before = url.searchParams.get('before')
    if (before) conditions.push(lt('created_at', before))

    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    const { count, data } = await entries.readMany(
      conditions.length > 0 ? conditions : undefined,
      { orderBy: { created_at: 'desc' }, limit, offset },
    )

    return Response.json({ entries: data.map(parseMetadata), total: count })
  }
}

export function getHandler(entries: BoundTable<any>) {
  return async (_req: Request, ctx: any) => {
    const id = ctx.params?.id
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const row = await entries.read(parseInt(id))
    if (!row) return Response.json({ error: 'not found' }, { status: 404 })
    return Response.json(parseMetadata(row))
  }
}
