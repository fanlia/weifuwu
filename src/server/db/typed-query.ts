/**
 * typedQuery——跨表查询的类型完整体（W3）
 *
 * 问题（P4 根因）：
 *   `orm.query.from('kb_chunks kc').join(...).select(...).run()` —— query
 *   builder 泛型面未绑定 shape——行类型恒为 `Row`（{ [col]: unknown }）——
 *   消费端被迫 `as unknown as X / as Array<Record<string, any>>`（平台 35 处）。
 *
 * 方案（纯类型面——运行时零成本）：
 *   `createTypedQuery(orm, schema)`——schema 为「表名 → shape」注册表。
 *   from/join 的 spec（`'kb_chunks kc'`）在类型层解析表/alias——select 的
 *   列引用（`'kc.id'`/裸列=主表）解析为对应列 Infer——行类型 = tuple
 *   保序映射 + aggregate/vectorScore 的 AS 键并入——未知列/未知 alias
 *   编译期红（never）。运行时 = SelectBuilder 链转发（零解析——纯转发）。
 *
 * 判负（诚实裁剪）：
 *   - `col AS alias` 不做（平台 0 消费——aggregate/vectorScore 的 as
 *     参数面已覆盖键别名场景——可被新增论证推翻）
 *   - where 值类型×列绑定不做（z.enum 坍缩 [string]——值面收益低——已登记
 *     W2/W3 修复面：enum 签名推断增强）
 *   - and/or 组合内层键不校验（外键校验已覆盖主要场景——组合式文档注明）
 */
import type { ZodRawShape, ZodType } from '../../shared/zod.ts'
import type { Orm } from './orm.ts'
import type { WhereExpr, WhereField } from './query.ts'

// ── 类型层 ────────────────────────────────────────────────

/** schema 注册表（表名 → shape） */
export type TypedSchema = Record<string, ZodRawShape>

type OutOf<Z> = Z extends ZodType<infer O> ? O : never

/** from/join spec 解析：'kb_chunks kc' → { table: 'kb_chunks'; alias: 'kc' } */
type Split<F extends string> = F extends `${infer T} ${infer A}` ? { table: T; alias: A } : { table: F; alias: F }

/** alias → 表名注册表（from 主表 + join 累积） */
type AddAlias<Reg extends Record<string, string>, F extends string> = Reg & { [K in Split<F>['alias']]: Split<F>['table'] }

/** 列引用校验/解析：`'kc.id'` → kc 表 id 列的 Out；裸列 → 主表 */
type ColOut<Sch, Reg, Main, C extends string> =
  C extends `${infer A}.${infer Col}`
    ? A extends keyof Reg
      ? Reg[A] extends keyof Sch
        ? Col extends keyof Sch[Reg[A] & keyof Sch]
          ? OutOf<Sch[Reg[A] & keyof Sch][Col & keyof Sch[Reg[A] & keyof Sch]]>
          : never
        : never
      : never
    : C extends keyof Sch[Main & keyof Sch]
      ? OutOf<Sch[Main & keyof Sch][C & keyof Sch[Main & keyof Sch]]>
      : never

/** select 列 → 行类型（对象键 = 列名去 alias 前缀——`kc.id` → `id`；同名键后覆盖） */
export type SelRow<Sch, Reg, Main, C extends readonly unknown[]> = {
  [K in Extract<C[number], string> as K extends `${string}.${infer Col}` ? Col : K]: ColOut<Sch, Reg, Main, K>
}

/** where 键白名单（合法列引用联合） */
type ColRefs<Sch, Reg, Main> = keyof Sch[Main & keyof Sch] | {
  [A in keyof Reg]: A extends string ? (Reg[A] extends keyof Sch ? `${A & string}.${keyof Sch[Reg[A] & keyof Sch] & string}` : never) : never
}[keyof Reg]

/** 值面列型绑定（W4——W1 登记失效断言复活）：string 列（含 enum 字面量）按列型收紧
 *  （eq:'robot' 红——enum 外拒绝）；jsonb/unknown 列保留 WhereField 宽面（深度等值兼容） */
type WhereFieldOf<V> = V extends string ? {
  col?: string; eq?: V; gt?: V; gte?: V; lt?: V; lte?: V; ne?: V;
  in?: V[]; notIn?: V[]; like?: string; ilike?: string; isNull?: boolean; between?: [V, V]
} : WhereField

/** where 约束（对象键 ∈ 合法列引用——字面量多余键红；值面 WhereField 保留组合式） */
export type TWhere<Sch, Reg, Main> = { [K in ColRefs<Sch, Reg, Main> as K & string]?: WhereFieldOf<ColOut<Sch, Reg, Main, K & string>> | WhereExpr[] }

/** aggregate AS 键并入行 */
type WithAgg<Row extends object, As extends string, V> = Row & { [K in As]: V }

/** 查询入口（from 后状态） */
export interface TypedQuery<Sch extends TypedSchema> {
  from<F extends string>(spec: F): TSelect<Sch, AddAlias<{}, F>, Split<F>['table'], {}>
}

/** 类型化 Select 链（Row 为累积行类型——select/aggregate 并入） */
export interface TSelect<Sch, Reg extends Record<string, string>, Main, Row extends object = {}> {
  join<F extends string>(spec: F, on: WhereExpr): TSelect<Sch, AddAlias<Reg, F>, Split<F>['table'] extends Main ? Main : Main, Row>
  select<C extends readonly (ColRefs<Sch, Reg, Main>)[]>(...cols: C): TSelect<Sch, Reg, Main, Row & SelRow<Sch, Reg, Main, C>>
  where<W extends TWhere<Sch, Reg, Main>>(w: W): this
  groupBy(...cols: string[]): this
  having<W extends TWhere<Sch, Reg, Main>>(w: W): this
  count<As extends string>(col: '*', as: As, filter?: WhereExpr): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  sum<As extends string>(col: string, as: As, filter?: WhereExpr): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  avg<As extends string>(col: string, as: As, filter?: WhereExpr): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  min<As extends string>(col: string, as: As, filter?: WhereExpr): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  max<As extends string>(col: string, as: As, filter?: WhereExpr): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  vectorScore<As extends string>(col: string, vec: number[], as: As): TSelect<Sch, Reg, Main, WithAgg<Row, As, number>>
  orderBy(col: string, dir?: 'asc' | 'desc'): this
  limit(n: number): this
  offset(n: number): this
  distinct(): this
  run(): Promise<Row[]>
  one(): Promise<Row | undefined>
}

// ── 运行时（纯转发——零解析成本） ──────────────────────────

/** 运行时 builder 代理：接口方法转发到 SelectBuilder 链（类型由接口标注） */
class TQB {
  private rt: import('./query.ts').SelectBuilder<import('./contracts.ts').Row>
  constructor(rt: import('./query.ts').SelectBuilder<import('./contracts.ts').Row>) { this.rt = rt }

  join(spec: string, on: WhereExpr) {
    this.rt = (this.rt.join(spec, on) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>)
    return this
  }
  select(...cols: (string | import('./query.ts').RawSql)[]) {
    this.rt = (this.rt.select(...cols) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>)
    return this
  }
  where(w: WhereExpr) { this.rt = (this.rt.where(w) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  groupBy(...cols: string[]) { this.rt = (this.rt.groupBy(...cols) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  having(w: WhereExpr) { this.rt = (this.rt.having(w) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  count(col = '*', as?: string, filter?: WhereExpr) { this.rt = (this.rt.count(col, as, filter) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  sum(col: string, as?: string, filter?: WhereExpr) { this.rt = (this.rt.sum(col, as, filter) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  avg(col: string, as?: string, filter?: WhereExpr) { this.rt = (this.rt.avg(col, as, filter) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  min(col: string, as?: string, filter?: WhereExpr) { this.rt = (this.rt.min(col, as, filter) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  max(col: string, as?: string, filter?: WhereExpr) { this.rt = (this.rt.max(col, as, filter) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  vectorScore(col: string, vec: number[], as: string) { this.rt = (this.rt.vectorScore(col, vec, as) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  orderBy(col: string, dir?: 'asc' | 'desc') { this.rt = (this.rt.orderBy(col, dir) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  limit(n: number) { this.rt = (this.rt.limit(n) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  offset(n: number) { this.rt = (this.rt.offset(n) as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  distinct() { this.rt = (this.rt.distinct() as unknown as import('./query.ts').SelectBuilder<import('./contracts.ts').Row>); return this }
  run() { return this.rt.run() as Promise<import('./contracts.ts').Row[]> }
  one() { return this.rt.one() as Promise<import('./contracts.ts').Row | undefined> }
}

/**
 * createTypedQuery——orm.query 的类型化入口（schema 仅类型锚点——运行时零成本）
 *
 * @example
 * const q = createTypedQuery(orm, { kb_chunks, kb_documents })
 * const rows = await q.from('kb_chunks kc')
 *   .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })
 *   .select('kc.id', 'kc.content', 'kd.filename')
 *   .where({ 'kc.agent_id': { eq: String(agentId) } })
 *   .run()
 * // rows[0].id: string · rows[0].filename: string | null · rows[0].nope: 编译期红
 */
export function createTypedQuery<Sch extends TypedSchema>(orm: Orm, _schema: Sch): TypedQuery<Sch> {
  return {
    from(spec: string) {
      return new TQB(orm.query.from(spec)) as unknown as TSelect<Sch, AddAlias<{}, string>, string, {}>
    },
  } as unknown as TypedQuery<Sch>
}
