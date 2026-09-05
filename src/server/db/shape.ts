/**
 * weifuwu/shape —— 形状层（shape+operator 架构的形状基座）
 *
 * shape = zod schema（数据形状单源）+ db 元数据（meta——表/列语义）
 * 派生面（与 zod 天然——零生成）：
 *   - 校验：shape.parse（API 边界）
 *   - 类型：z.infer
 *   - 变体：insertSchema/updateSchema（省略自动列）
 *   - db 元数据：dbMeta（建表/算子类型收窄——后续 W3 消费）
 *
 * 用法：
 *   const Agent = shape({
 *     table: 'agents',
 *     fields: {
 *       id: z.uuid().meta({ pk: true, default: 'random' }),
 *       appId: z.string().meta({ column: 'app_id', notNull: true }),
 *       type: z.enum(['ai','user','webhook']).meta({ notNull: true }),
 *       name: z.string().meta({ notNull: true }),
 *       createdAt: z.date().meta({ column: 'created_at', default: 'now' }),
 *     },
 *   })
 */
import { z, type ZodType, type Infer, type ZodRawShape, type ZodMeta } from '../../shared/zod.ts'

/** 字段级 db 元数据（shape 层语义——建表/算子/校验收窄的驱动面） */
export interface FieldDbMeta extends ZodMeta {
  /** 列名（默认 = 字段名） */
  column?: string
  /** 主键 */
  pk?: boolean
  /** 唯一 */
  unique?: boolean
  /** NOT NULL（校验面 optional 之外——DB 层约束） */
  notNull?: boolean
  /** 默认值（'random'=gen_random_uuid · 'now'=NOW() · 字面量） */
  default?: 'random' | 'now' | string | number
  /** 外键（references 表.列——关系面） */
  references?: string
  /** 级联（ON DELETE） */
  onDelete?: 'cascade' | 'set null' | 'restrict'
}

export interface DbField {
  name: string
  schema: ZodType
  meta: FieldDbMeta
  /** 输出类型（z.infer 快捷） */
  type: unknown
}

/** 形状（表级） */
export interface Shape<S extends ZodRawShape = ZodRawShape> {
  /** 表/集合名 */
  table: string
  /** 字段表（原始 zod shape） */
  fields: S
  /** 字段元数据展平（name → FieldDbMeta） */
  dbFields: Record<string, FieldDbMeta>
  /** 主键字段名（pk meta） */
  pkField?: string
  /** infers */
  output: { [K in keyof S]: Infer<S[K]> }
  /** 插入变体（省略 auto 列：pk+random/now 默认） */
  insertSchema(): ZodType<Record<string, unknown>>
  /** 字段名 → 列名翻译（写入面：shape 字段名 → db 列名） */
  toDb(record: Record<string, unknown>): Record<string, unknown>
  /** 列名 → 字段名翻译（读取面：db 行 → shape 字段名——GraphQL/API 输出） */
  fromDb(record: Record<string, unknown>): Record<string, unknown>
  /** 更新变体（全字段 optional——部分更新面） */
  updateSchema(): ZodType<Record<string, unknown>>
}

/** DB 字段 meta 装饰快捷（zod schema 上挂 meta——db 列语义） */
function withMeta<T extends ZodType>(t: T, m: FieldDbMeta): T {
  return t.meta(m) as T
}

export function shape<S extends ZodRawShape>(def: {
  table: string
  fields: S
}): Shape<S> {
  const dbFields: Record<string, FieldDbMeta> = {}
  let pkField: string | undefined
  for (const [name, schema] of Object.entries(def.fields)) {
    const m = (schema.metaInfo ?? {}) as FieldDbMeta
    dbFields[name] = {
      column: m.column ?? name,
      ...(m.pk ? { pk: true } : {}),
      ...(m.unique ? { unique: true } : {}),
      ...(m.notNull ? { notNull: true } : {}),
      ...(m.default !== undefined ? { default: m.default } : {}),
      ...(m.references ? { references: m.references } : {}),
      ...(m.onDelete ? { onDelete: m.onDelete } : {}),
    }
    if (m.pk) pkField = name
  }
  const sig = { table: def.table, fields: def.fields, dbFields, pkField } as Shape<S>
  // 变体派生：insert = omit(auto 字段（pk+random/now 默认——DB 侧生成））
  // update = 全字段 optional（部分更新面——null 与缺失区分由调用边界）
  // auto 列 = 默认值 DB 侧生成（random/now——insert/update 时省略——不论是否 pk）
  const isAuto = (name: string): boolean => {
    const m = dbFields[name]
    return m?.default === 'random' || m?.default === 'now'
  }
  ;(sig as unknown as { insertSchema: () => ZodType<Record<string, unknown>> }).insertSchema = () => {
    const entries: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(def.fields)) {
      if (isAuto(name)) continue
      // DB 侧默认值列（default 显式存在）→ 可缺省（省略走 DB 默认）
      // nullable 列 → 可缺省（键缺 = DB NULL——nullable 语义即可选）
      const v = field as ZodType
      const isNullable = (v as { _typeName?: () => string })._typeName?.() === 'nullable'
      entries[name] = dbFields[name]?.default !== undefined || isNullable ? v.optional() : v
    }
    return cleanUndefined(z.object(entries as S)) as unknown as ZodType<Record<string, unknown>>
  }
  ;(sig as unknown as { toDb: (r: Record<string, unknown>) => Record<string, unknown> }).toDb = (record) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      const meta = dbFields[k]
      out[meta?.column ?? k] = v
    }
    return out
  }
  ;(sig as unknown as { fromDb: (r: Record<string, unknown>) => Record<string, unknown> }).fromDb = (record) => {
    const out: Record<string, unknown> = {}
    for (const [name, meta] of Object.entries(dbFields)) {
      if (record[(meta as FieldDbMeta).column ?? name] !== undefined) out[name] = record[(meta as FieldDbMeta).column ?? name]
    }
    // 未映射列（select 额外列如 member_count）原键保留——join/聚合面不丢
    for (const k of Object.keys(record)) {
      const mapped = Object.values(dbFields).some((m) => (m as FieldDbMeta).column === k)
      if (!mapped && !(k in out)) out[k] = record[k]
    }
    return out
  }
  ;(sig as unknown as { updateSchema: () => ZodType<Record<string, unknown>> }).updateSchema = () => {
    const optionalized: Record<string, ZodType> = {}
    for (const [name, s] of Object.entries(def.fields)) {
      if (isAuto(name)) continue
      optionalized[name] = (s as ZodType).optional()
    }
    return cleanUndefined(z.object(optionalized)) as unknown as ZodType<Record<string, unknown>>
  }
  return sig
}

/** 变体 parse 产物清洗：undefined 键删除（optional 缺省——不产生写入面 null 污染） */
function cleanUndefined<T extends import('../../shared/zod.ts').ZodType>(t: T): T {
  return t.transform((v: unknown) => {
    if (typeof v !== 'object' || v === null) return v
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined))
  }) as unknown as T
}

/** 字段 meta 快捷方法（shape 定义侧手感的统一入口） */
export const f = {
  /** 主键（random uuid 默认） */
  pk: <T extends ZodType>(t: T): T => withMeta(t, { pk: true, default: 'random' }),
  /** NOT NULL */
  req: <T extends ZodType>(t: T): T => withMeta(t, { notNull: true }),
  /** 列名映射 */
  col: <T extends ZodType>(t: T, column: string): T => withMeta(t, { column }),
  /** 默认 now */
  now: <T extends ZodType>(t: T): T => withMeta(t, { default: 'now' }),
  /** 唯一 */
  unique: <T extends ZodType>(t: T): T => withMeta(t, { unique: true }),
}
