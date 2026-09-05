/**
 * weifuwu/db — http（协议面 helpers——handler 样板消失第二刀）
 *
 * listQuery：URL query → { filter, sort, limit, offset }（rest 私有解析提取——
 *   手写 route 的 32 处 searchParams 解析收口）——枚举白名单/sort 字段校验/
 *   limit clamp（默认 20 · max 100）与 rest 行为等价。
 * errorResponse：错误 → Response（状态码映射——DbError validation→400 ·
 *   唯一冲突 23505→409 · 显式 status 优先（业务守卫 403 等））——catch 样板收口。
 */
import type { ZodType, ZodRawShape } from '../../shared/zod.ts'
import type { Shape } from './shape.ts'
import { DbError } from './errors.ts'

export interface ListQueryOptions {
  /** limit 上限（缺省 100） */
  maxLimit?: number
  /** limit 缺省（缺省 20） */
  defaultLimit?: number
}

function unwrap(schema: ZodType): ZodType {
  let s = schema as ZodType
  for (;;) {
    const inner = (s as unknown as { inner?: ZodType }).inner as ZodType | undefined
    if (inner && typeof (s as unknown as { _typeName?: string })._typeName === 'string' && ['optional', 'nullable', 'default', 'effects', 'transform'].includes((s as unknown as { _typeName: string })._typeName)) {
      s = inner
    } else break
  }
  return s
}

/** 枚举值集（列 schema unwrap 后 values——filter 白名单校验） */
function enumOf(shapeDef: Shape<ZodRawShape>, field: string): string[] | undefined {
  const s = unwrap((shapeDef.fields as Record<string, ZodType>)[field] as ZodType)
  const v = (s as unknown as { values?: string[] }).values
  return Array.isArray(v) ? v.map(String) : undefined
}

/**
 * URL query → 列表参数（eq 直排 · sort `-field,field2` 多字段 · limit/offset clamp）。
 *
 * 校验失败（枚举值白名单/未知 sort 字段）→ 抛错（调用方 errorResponse——400）。
 * filter 键 = shape 字段名（未知列由 orm 面校验兜底——42P01 显式）。
 */
export function listQuery(
  url: URL,
  shapeDef: Shape<ZodRawShape>,
  opts: ListQueryOptions = {},
): { filter: Record<string, unknown>; sort: { field: string; dir: 'asc' | 'desc' }[]; limit: number; offset: number } {
  const maxLimit = opts.maxLimit ?? 100
  const defaultLimit = opts.defaultLimit ?? 20
  // Shape 实体 / OrmTable（__shape 解包——与 bodyOf 对称——直传 table 面）
  const withShape = shapeDef as unknown as { __shape?: Shape<ZodRawShape> }
  const sh = withShape.__shape ?? (shapeDef as Shape<ZodRawShape>)
  const search = url.searchParams
  const cols = Object.keys(sh.fields as Record<string, ZodType>)
  const colSet = new Set(cols)
  // eq 直排（flat 面——标量列只接受标量值；枚举白名单校验）
  const filter: Record<string, unknown> = {}
  for (const [k, v] of search.entries()) {
    if (k === 'sort' || k === 'limit' || k === 'offset') continue
    const values = enumOf(sh, k)
    if (values && !values.includes(v)) throw new Error(`invalid enum value for ${k}: ${v}（允许：${values.join(' | ')}）`)
    filter[k] = { eq: v }
  }
  // sort 解析（`-created_at,name` → [{created_at,desc},{name,asc}]）
  const sort: { field: string; dir: 'asc' | 'desc' }[] = []
  const sortRaw = search.get('sort')
  if (sortRaw) for (const part of sortRaw.split(',')) {
    const dir = part.startsWith('-') ? 'desc' : 'asc'
    const field = dir === 'desc' ? part.slice(1) : part
    if (!colSet.has(field)) throw new Error(`invalid sort field: ${field}`)
    sort.push({ field, dir })
  }
  const limit = Math.min(maxLimit, Math.max(1, parseInt(search.get('limit') ?? String(defaultLimit), 10) || defaultLimit))
  const offset = Math.max(0, parseInt(search.get('offset') ?? '0', 10) || 0)
  return { filter, sort, limit, offset }
}

/**
 * 错误 → Response（状态码映射——catch 样板收口）。
 * - 显式 status 优先（业务守卫抛错 403 等——调用方定语义）
 * - DbError：validation → 400 · 23505 唯一冲突 → 409 · 其余 → 400（缺省）
 */
export function errorResponse(e: unknown, status?: number): Response {
  const msg = e instanceof Error ? e.message : String(e)
  const st = status ?? (e instanceof DbError ? (e.code === '23505' ? 409 : 400) : 400)
  return Response.json({ error: msg }, { status: st })
}
