/**
 * weifuwu/db — 声明式 Schema（DDL 算子化）
 *
 * 业务零 SQL 字符串：表结构 = 声明（ZodRawShape 列 + 表级索引/约束/FK 元数据）→
 * compileSchemaDDL 在框架内部生成 CREATE/ALTER/INDEX 语句（字符串不外泄）→
 * pg.runMigration(name, ddl) 执行（幂等记录）· MemorySql.applySchema 直构造元数据。
 *
 * 声明来源：列 = shape（类型映射 z.string→TEXT / z.number().int→INT / z.number→DOUBLE
 * PRECISION / z.boolean→BOOLEAN / z.date→TIMESTAMPTZ / z.uuid→UUID / z.json·z.array·
 * z.object→JSONB / z.enum→TEXT+CHECK）+ f 修饰（f.pk/f.req/f.now/f.unique/f.default/
 * f.col）；表级 = TableDecl（复合唯一/refs FK/indexes/columnTypes 注解）。
 *
 * 升级路径：每个表产出 CREATE TABLE IF NOT EXISTS（全列——新库）+ 每列
 * ALTER TABLE ADD COLUMN IF NOT EXISTS（老库增量——幂等）+ CREATE INDEX IF NOT EXISTS。
 */
import type { ZodType } from '../../shared/zod.ts'
import type { ZodRawShape } from '../../shared/zod.ts'

// ── 声明 ──────────────────────────────────────────────────

export interface IndexDecl {
  /** 列（可带 DESC——`{ col: 'created_at', desc: true }`） */
  cols: (string | { col: string; desc?: boolean })[]
  /** 索引名（缺省 idx_<table>_<cols>） */
  name?: string
  unique?: boolean
  /** 访问方法（'ivfflat'/'brin'…） */
  using?: string
  /** 操作符类（'vector_cosine_ops'） */
  opclass?: string
  /** WITH 参数文本（'lists = 100'） */
  with?: string
  /** 部分索引条件（AND 等值/不等/IS NULL 面——声明值内联（非用户输入）） */
  where?: { col: string; eq?: string; ne?: string; isNull?: boolean }[]
}

export interface TableDecl {
  name: string
  columns: Record<string, unknown>
  /** 复合唯一组（列级 f.unique 之外） */
  uniques?: string[][]
  /** 列 → 外键引用（schema REFERENCES 面；跨边界不声明 refs——应用层保证） */
  refs?: Record<string, { table: string; col?: string; onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }>
  /** 列型注解（shape 默认映射外：'FLOAT8'/'vector(1024)'/'BIGSERIAL'/…） */
  columnTypes?: Record<string, string>
  /** CHECK 枚举（非 z.enum 列的 IN 约束：列 → 允许值） */
  checks?: Record<string, string[]>
  /** 老库升级：去掉 NOT NULL（ALTER COLUMN DROP NOT NULL——如 SSO 无密码） */
  dropNotNull?: string[]
  indexes?: IndexDecl[]
}

export interface EnumDecl {
  name: string
  values: string[]
}

export interface SchemaModule {
  /** 扩展（'vector' 等——CREATE EXTENSION IF NOT EXISTS 前置） */
  extensions?: string[]
  /** PG 枚举类型（CREATE TYPE + 值补增——列型用 columnTypes: { col: 'enum名' } 引用） */
  enums?: EnumDecl[]
  tables: TableDecl[]
}

// ── zod → PG 列型（自研 zod API：_typeName()/metaInfo + 运行时字段 duck-read） ──

function innerOf(t: ZodType): ZodType | undefined {
  return (t as unknown as { inner?: ZodType }).inner
}

export function zodTypeOf(t: ZodType): string {
  const tn = t._typeName()
  switch (tn) {
    case 'string': return (t as unknown as { _uuid?: boolean })._uuid ? 'UUID' : 'TEXT'
    case 'number': return (t as unknown as { _int?: boolean })._int ? 'INT' : 'DOUBLE PRECISION'
    case 'boolean': return 'BOOLEAN'
    case 'datetime': return 'TIMESTAMPTZ'
    case 'json': case 'object': case 'array': return 'JSONB'
    case 'enum': return 'TEXT'
    case 'optional': case 'nullable': case 'default': case 'effects': case 'transform':
      return zodTypeOf(innerOf(t) ?? (t as unknown as ZodType))
    default:
      throw new Error(`schema: 无法映射 zod 类型 ${tn}（列型注解 columnTypes 可覆盖）`)
  }
}

function enumValuesOf(t: ZodType): string[] | undefined {
  if (t._typeName() === 'enum') return ((t as unknown as { values: readonly string[] }).values ?? []).map(String)
  const inner = innerOf(t)
  return inner ? enumValuesOf(inner) : undefined
}

/** 默认值字面量 → PG DEFAULT 片段（string→'...' · number→n · bool→TRUE/FALSE ·
 *  array/object→'json'::JSONB · null→NULL） */
function pgDefault(v: unknown): string {
  if (v === null) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::JSONB`
}

// ── DDL 生成器（框架内部——业务零字符串） ─────────────────

export function compileSchemaDDL(mod: SchemaModule): string {
  const out: string[] = []
  for (const ext of mod.extensions ?? []) out.push(`CREATE EXTENSION IF NOT EXISTS ${ext};`)
  for (const e of mod.enums ?? []) {
    out.push(`DO $$ BEGIN\n  CREATE TYPE ${e.name} AS ENUM (${e.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`)
    for (const v of e.values) out.push(`ALTER TYPE ${e.name} ADD VALUE IF NOT EXISTS '${v.replace(/'/g, "''")}'`)
  }
  for (const t of mod.tables) out.push(...compileTableDDL(t))
  return out.join('\n')
}

function compileTableDDL(t: TableDecl): string[] {
  const out: string[] = []
  const colDefs: string[] = []
  const inlineUniques: string[] = []
  const checks: string[] = []
  const notNull = (zt: ZodType): boolean => {
    // nullable/optional → 可空；f.req 显式 NOT NULL；zod 默认（无 nullable）→ NOT NULL
    // （shape 面与 schema.sql 约定：显式 nullable() 才可空——对齐 P0 列集）
    const tn = zt._typeName()
    if (tn === 'nullable' || tn === 'optional') return false
    if (tn === 'default' || tn === 'effects' || tn === 'transform') {
      return notNull(innerOf(zt) ?? zt)
    }
    return true
  }
  for (const [field, ztRaw] of Object.entries(t.columns)) {
    const zt = ztRaw as unknown as ZodType
    const meta = zt.metaInfo
    const col = (meta.column as string) ?? field
    let pgType = t.columnTypes?.[col] ?? zodTypeOf(zt)
    const parts: string[] = [col, pgType]
    if (meta.pk) {
      parts.push('PRIMARY KEY')
      if (meta.default === 'random') parts.push('DEFAULT gen_random_uuid()')
    } else {
      if (meta.default === 'random') parts.push('DEFAULT gen_random_uuid()')
      else if (meta.default === 'now') parts.push('DEFAULT NOW()')
      else if (meta.default !== undefined) parts.push(`DEFAULT ${pgDefault(meta.default)}`)
      // NOT NULL 判定：nullable()/optional()/f.req 显式面——对齐 schema.sql 惯例
      // （可空=显式 nullable；其余 NOT NULL——含 NOT NULL DEFAULT）
      if (notNull(zt)) parts.push('NOT NULL')
      if (meta.unique) parts.push('UNIQUE')
    }
    const ref = meta.references as string | undefined
    if (ref) {
      const [rtable, rcol] = ref.includes('.') ? ref.split('.') : [ref, 'id']
      parts.push(`REFERENCES ${rtable} (${rcol})`)
      if (meta.onDelete) parts.push(`ON DELETE ${meta.onDelete}`)
    }
    const enumVals = enumValuesOf(zt)
    if (enumVals && enumVals.length > 1) {
      checks.push(`CONSTRAINT ${t.name}_${col}_check CHECK (${col} IN (${enumVals.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}))`)
    }
    colDefs.push(`  ${parts.join(' ')}`)
  }
  for (const u of t.uniques ?? []) inlineUniques.push(`  UNIQUE (${u.join(', ')})`)
  for (const [col, r] of Object.entries(t.refs ?? {})) {
    const idx = colDefs.findIndex((c) => c.startsWith(`  ${col} `))
    if (idx >= 0) {
      colDefs[idx] += ` REFERENCES ${r.table} (${r.col ?? 'id'})${r.onDelete ? ` ON DELETE ${r.onDelete}` : ''}`
    } else {
      throw new Error(`schema: ${t.name}.${col} refs 声明的列不存在`)
    }
  }
  for (const [col, vals] of Object.entries(t.checks ?? {})) {
    checks.push(`CONSTRAINT ${t.name}_${col}_check CHECK (${col} IN (${vals.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}))`)
  }
  if (t.dropNotNull) out.push(`ALTER TABLE ${t.name} ALTER COLUMN ${t.dropNotNull.join(', ')} DROP NOT NULL;`)
  out.push(`CREATE TABLE IF NOT EXISTS ${t.name} (\n${[...colDefs, ...inlineUniques, ...checks].join(',\n')}\n);`)
  // 老库增量：ADD COLUMN IF NOT EXISTS 逐列（幂等——新库全 skip）
  for (const [field, ztRaw] of Object.entries(t.columns)) {
    const zt = ztRaw as unknown as ZodType
    const meta = zt.metaInfo
    const col = (meta.column as string) ?? field
    if (meta.pk) continue // pk 不 ALTER（建表时保证——老库 pk 必在）
    const pgType = t.columnTypes?.[col] ?? zodTypeOf(zt)
    const parts: string[] = [`ALTER TABLE ${t.name} ADD COLUMN IF NOT EXISTS ${col} ${pgType}`]
    if (meta.default === 'now') parts.push('DEFAULT NOW()')
    else if (meta.default !== undefined) parts.push(`DEFAULT ${pgDefault(meta.default)}`)
    if (!notNull(zt) || meta.default !== undefined) {
      // 可空/有默认——无 NOT NULL（存量行无法约束）
    } else {
      parts.push('NOT NULL')
    }
    out.push(`${parts.join(' ')};`)
  }
  // 索引（唯一/部分/ivfflat/opclass/WITH）
  for (const ix of t.indexes ?? []) {
    const cols = ix.cols.map((c) => typeof c === 'string' ? c : `${c.col}${c.desc ? ' DESC' : ''}`).join(', ')
    const name = ix.name ?? `idx_${t.name}_${ix.cols.map((c) => typeof c === 'string' ? c : c.col).join('_')}`
    const unique = ix.unique ? 'UNIQUE ' : ''
    const using = ix.using ? ` USING ${ix.using}` : ''
    const opclass = ix.opclass ? ` ${ix.opclass}` : ''
    const with_ = ix.with ? ` WITH (${ix.with})` : ''
    const where = ix.where ? ' WHERE ' + ix.where.map((w) => {
      if (w.isNull !== undefined) return `${w.col} IS ${w.isNull ? '' : 'NOT '}NULL`
      if (w.eq !== undefined) return `${w.col} = '${w.eq.replace(/'/g, "''")}'`
      if (w.ne !== undefined) return `${w.col} <> '${w.ne.replace(/'/g, "''")}'`
      return ''
    }).filter(Boolean).join(' AND ') : ''
    out.push(`CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${t.name}${using} (${cols}${opclass})${with_}${where};`)
  }
  return out
}
