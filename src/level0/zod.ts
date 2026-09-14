/**
 * weifuwu/zod —— 自研校验库子集（shape+operator 架构的形状基座）
 *
 * 裁剪面（诚实边界——应用层输入校验足够）：
 * - 只做同步 parse（无 async/水合）· 无 lazy/instanceof/date 对象
 * - 类型推断：infer 型别名 + parse 收窄（TS 泛型 phantom）——不做 zod 4 级类型体操
 * - meta() 通用元数据挂载（shape 层 db 语义消费——zod 核心零 db 概念）
 *
 * 使用：
 *   const User = z.object({ email: z.string().email(), role: z.enum(['a','b']).optional() })
 *   User.parse(raw)              // 校验（抛 ZodError）
 *   User.safeParse(raw)          // { success, data?, error? }
 *   type T = z.infer<typeof User>
 */
export class ZodError extends Error {
  readonly issues: { path: string; message: string }[]
  constructor(issues: { path: string; message: string }[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; '))
    this.name = 'ZodError'
    this.issues = issues
  }
}

/** 校验元数据（shape 层 db 语义消费——核心只存储透传） */
export interface ZodMeta {
  [key: string]: unknown
}

/** 基类（Out=输出类型·In=输入类型——phantom 类型面） */
export abstract class ZodType<Out = unknown, In = unknown> {
  declare readonly _out: Out
  declare readonly _in: In
  protected _meta: ZodMeta = {}

  abstract _parse(value: unknown): { ok: boolean; value?: Out; path?: string; message?: string }
  abstract _typeName(): string

  /** 读取元数据（shape 层消费） */
  get metaInfo(): ZodMeta { return this._meta }
  /** 通用元数据挂载（返回增强 schema——Out 不变） */
  meta(m: ZodMeta): this {
    this._meta = { ...this._meta, ...m }
    return this
  }

  parse(value: unknown): Out {
    const r = this._parse(value)
    if (!r.ok) throw new ZodError([{ path: r.path ?? '', message: r.message ?? 'invalid' }])
    return r.value as Out
  }

  safeParse(value: unknown): { success: true; data: Out } | { success: false; error: ZodError } {
    const r = this._parse(value)
    return r.ok
      ? { success: true, data: r.value as Out }
      : { success: false, error: new ZodError([{ path: r.path ?? '', message: r.message ?? 'invalid' }]) }
  }

  optional(): ZodOptional<this> { return new ZodOptional(this) }
  nullable(): ZodNullable<this> { return new ZodNullable(this) }
  default<D extends In>(d: D): ZodDefault<this, D> { return new ZodDefault(this, d) }
  refine(fn: (v: Out) => boolean, message?: string): ZodEffects<this> { return new ZodEffects(this, fn, message) }
  transform<O2>(fn: (v: Out) => O2): ZodTransform<this, O2> { return new ZodTransform(this, fn) }
}

/** 类型/推断别名 */
export type Infer<T extends ZodType> = T extends ZodType<infer O> ? O : never
export type InferInput<T extends ZodType> = T extends ZodType<any, infer I> ? I : never

// ── 基础类型 ──────────────────────────────────────────────

export class ZodString extends ZodType<string> {
  _typeName() { return 'string' }
  _parse(v: unknown) {
    if (typeof v !== 'string') return { ok: false, path: '', message: 'expected string' }
    let s = v
    if (this._min !== undefined && s.length < this._min) return { ok: false, path: '', message: `too small (min ${this._min})` }
    if (this._max !== undefined && s.length > this._max) return { ok: false, path: '', message: `too big (max ${this._max})` }
    if (this._pattern && !this._pattern.test(s)) return { ok: false, path: '', message: 'invalid pattern' }
    if (this._email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, path: '', message: 'invalid email' }
    if (this._uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { ok: false, path: '', message: 'invalid uuid' }
    return { ok: true, value: s }
  }
  private _min?: number
  private _max?: number
  private _pattern?: RegExp
  private _email = false
  private _uuid = false
  min(n: number) { this._min = n; return this }
  max(n: number) { this._max = n; return this }
  regex(r: RegExp, _msg?: string) { this._pattern = r; return this }
  email() { this._email = true; return this }
  uuid() { this._uuid = true; return this }
}

export class ZodNumber extends ZodType<number> {
  _typeName() { return 'number' }
  _parse(v: unknown) {
    if (typeof v !== 'number' || Number.isNaN(v)) return { ok: false, path: '', message: 'expected number' }
    let n = v
    if (this._int && !Number.isInteger(n)) return { ok: false, path: '', message: 'expected integer' }
    if (this._min !== undefined && n < this._min) return { ok: false, path: '', message: `too small (min ${this._min})` }
    if (this._max !== undefined && n > this._max) return { ok: false, path: '', message: `too big (max ${this._max})` }
    return { ok: true, value: n }
  }
  private _int = false
  private _min?: number
  private _max?: number
  int() { this._int = true; return this }
  min(n: number) { this._min = n; return this }
  max(n: number) { this._max = n; return this }
  positive() { this._min = 0; return this }
}

export class ZodBoolean extends ZodType<boolean> {
  _typeName() { return 'boolean' }
  _parse(v: unknown) {
    if (typeof v !== 'boolean') return { ok: false, path: '', message: 'expected boolean' }
    return { ok: true, value: v }
  }
}

export class ZodLiteral<L extends string | number | boolean> extends ZodType<L> {
  private readonly lit: L
  constructor(lit: L) { super(); this.lit = lit }
  get value(): L { return this.lit }
  _typeName() { return 'literal' }
  _parse(v: unknown) {
    if (v !== this.lit) return { ok: false, path: '', message: `expected literal ${JSON.stringify(this.lit)}` }
    return { ok: true, value: v as L }
  }
}

export class ZodEnum<T extends readonly [string, ...string[]]> extends ZodType<T[number]> {
  private readonly raw: T
  constructor(values: T) { super(); this.raw = values }
  get values(): T { return this.raw }
  _typeName() { return 'enum' }
  _parse(v: unknown) {
    if (typeof v !== 'string' || !(this.raw as readonly string[]).includes(v)) {
      return { ok: false, path: '', message: `expected one of ${this.raw.join(' | ')}` }
    }
    return { ok: true, value: v as T[number] }
  }
}

export class ZodDate extends ZodType<string> {
  _typeName() { return 'datetime' }
  _parse(v: unknown) {
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
      return { ok: false, path: '', message: 'expected datetime string (ISO)' }
    }
    return { ok: true, value: v }
  }
}

/** 向量列（pgvector——dims 维度标注；传输/内存面按 number[] 数组成员；真库列型
 *  vector(dims)——SchemaModule columnTypes 特化覆盖。Infer=number[]（S2——embedding
 *  不再 ZodJson unknown） */
export class ZodVector extends ZodType<number[]> {
  readonly dims: number
  constructor(dims: number) { super(); this.dims = dims }
  _typeName() { return 'vector' }
  _parse(v: unknown) {
    if (typeof v !== 'object' || v === null || !Array.isArray(v) || !v.every((n) => typeof n === 'number')) {
      return { ok: false, path: '', message: 'expected number[] vector' }
    }
    if (this.dims > 0 && v.length !== this.dims) {
      return { ok: false, path: '', message: `expected vector(${this.dims})——got ${v.length} dims` }
    }
    return { ok: true, value: v }
  }
}

export class ZodJson extends ZodType<unknown> {
  _typeName() { return 'json' }
  _parse(v: unknown) { return { ok: true, value: v } }
}

// ── 复合 ──────────────────────────────────────────────────

export type ZodRawShape = Record<string, ZodType>

export class ZodObject<S extends ZodRawShape> extends ZodType<{ [K in keyof S]: Infer<S[K]> }> {
  readonly shape: S
  constructor(shape: S) { super(); this.shape = shape }
  _typeName() { return 'object' }
  _parse(v: unknown) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, path: '', message: 'expected object' }
    const out: Record<string, unknown> = {}
    const issues: { path: string; message: string }[] = []
    for (const [k, s] of Object.entries(this.shape)) {
      // 运行时 key 存在于对象（optional 时允许缺失）
      const r = s._parse((v as Record<string, unknown>)[k])
      if (!r.ok) { issues.push({ path: k, message: r.message ?? '' }); continue }
      out[k] = r.value
    }
    if (issues.length) return { ok: false, path: issues[0].path, message: issues[0].message }
    return { ok: true, value: out as { [K in keyof S]: Infer<S[K]> } }
  }
  pick<K extends keyof S>(keys: readonly K[]): ZodObject<Pick<S, K>> {
    const n = {} as Pick<S, K>
    for (const k of keys) n[k] = this.shape[k]
    return new ZodObject(n)
  }
  omit<K extends keyof S>(keys: readonly K[]): ZodObject<Omit<S, K>> {
    const n = {} as Omit<S, K>
    for (const [k, v] of Object.entries(this.shape)) if (!(keys as readonly string[]).includes(k)) (n as Record<string, ZodType>)[k] = v
    return new ZodObject(n)
  }
  extend<S2 extends ZodRawShape>(extra: S2): ZodObject<S & S2> {
    return new ZodObject({ ...this.shape, ...extra } as S & S2)
  }
}

export class ZodArray<T extends ZodType> extends ZodType<Infer<T>[]> {
  private readonly inner: T
  constructor(item: T) { super(); this.inner = item }
  get itemSchema(): T { return this.inner }
  _typeName() { return 'array' }
  _parse(v: unknown) {
    if (!Array.isArray(v)) return { ok: false, path: '', message: 'expected array' }
    if (this._min !== undefined && v.length < this._min) return { ok: false, path: '', message: `too small (min ${this._min})` }
    if (this._max !== undefined && v.length > this._max) return { ok: false, path: '', message: `too big (max ${this._max})` }
    const out: unknown[] = []
    for (let i = 0; i < v.length; i++) {
      const r = this.inner._parse(v[i])
      if (!r.ok) return { ok: false, path: `${i}`, message: r.message }
      out.push(r.value)
    }
    return { ok: true, value: out as Infer<T>[] }
  }
  private _min?: number
  private _max?: number
  min(n: number) { this._min = n; return this }
  max(n: number) { this._max = n; return this }
}

export class ZodUnion<T extends [ZodType, ZodType, ...ZodType[]]> extends ZodType<Infer<T[number]>> {
  private readonly options: T
  constructor(options: T) { super(); this.options = options }
  _typeName() { return 'union' }
  _parse(v: unknown) {
    let first: { path: string; message: string } | null = null
    for (const o of this.options) {
      const r = o._parse(v)
      if (r.ok) return { ok: true, value: r.value as Infer<T[number]> }
      if (!first) first = { path: r.path ?? '', message: r.message ?? '' }
    }
    return { ok: false, path: '', message: `expected union (${first?.message})` }
  }
}

export class ZodDiscriminatedUnion<
  D extends string,
  O extends Record<string, unknown>,
  T extends [ZodObject<ZodRawShape>, ZodObject<ZodRawShape>, ...ZodObject<ZodRawShape>[]],
> extends ZodType<Infer<T[number]>> {
  private readonly disc: D
  private readonly options: T
  private readonly discValueOf: (shape: ZodRawShape) => unknown
  constructor(
    disc: D,
    options: T,
    discValueOf: (shape: ZodRawShape) => unknown,
  ) { super(); this.disc = disc; this.options = options; this.discValueOf = discValueOf }
  _typeName() { return 'disUnion' }
  _parse(v: unknown) {
    if (typeof v !== 'object' || v === null) return { ok: false, path: '', message: 'expected object' }
    const dv = (v as Record<string, unknown>)[this.disc]
    for (const o of this.options) {
      if (this.discValueOf(o.shape) === dv) {
        const r = o._parse(v)
        return r.ok ? { ok: true, value: r.value as Infer<T[number]> } : { ok: false, path: `(${String(dv)})`, message: r.message ?? '' }
      }
    }
    return { ok: false, path: this.disc, message: `invalid discriminator value ${JSON.stringify(dv)}` }
  }
}

function discValueOf(shape: ZodRawShape, disc: string): unknown {
  const f = shape[disc]
  if (f instanceof ZodLiteral) return (f as unknown as { lit: unknown }).lit
  if (f instanceof ZodEnum) return (f as unknown as { values: unknown }).values
  throw new Error(`z.discriminatedUnion: 判别字段需为 literal/enum——得到 ${f?._typeName?.()}`)
}

export class ZodOptional<T extends ZodType> extends ZodType<Infer<T> | undefined> {
  private readonly inner: T
  constructor(inner: T) { super(); this.inner = inner }
  _typeName() { return 'optional' }
  _parse(v: unknown): { ok: true; value: Infer<T> | undefined } | { ok: false; path: string; message: string } {
    if (v === undefined) return { ok: true, value: undefined }
    return this.inner._parse(v) as { ok: true; value: Infer<T> | undefined } | { ok: false; path: string; message: string }
  }
}

export class ZodNullable<T extends ZodType> extends ZodType<Infer<T> | null> {
  private readonly inner: T
  constructor(inner: T) { super(); this.inner = inner }
  _typeName() { return 'nullable' }
  _parse(v: unknown): { ok: true; value: Infer<T> | null } | { ok: false; path: string; message: string } {
    if (v === null) return { ok: true, value: null }
    return this.inner._parse(v) as { ok: true; value: Infer<T> | null } | { ok: false; path: string; message: string }
  }
}

export class ZodDefault<T extends ZodType, D> extends ZodType<Infer<T>> {
  private readonly inner: T
  private readonly d: D
  constructor(inner: T, d: D) { super(); this.inner = inner; this.d = d }
  _typeName() { return 'default' }
  _parse(v: unknown): { ok: true; value: Infer<T> } | { ok: false; path: string; message: string } {
    if (v === undefined) {
      const dv = typeof this.d === 'function' ? (this.d as () => unknown)() : this.d
      const r = this.inner._parse(dv)
      return r as { ok: true; value: Infer<T> } | { ok: false; path: string; message: string }
    }
    return this.inner._parse(v) as { ok: true; value: Infer<T> } | { ok: false; path: string; message: string }
  }
}

export class ZodEffects<T extends ZodType> extends ZodType<Infer<T>> {
  private readonly inner: T
  private readonly fn: (v: Infer<T>) => boolean
  private readonly msg?: string
  constructor(inner: T, fn: (v: Infer<T>) => boolean, msg?: string) { super(); this.inner = inner; this.fn = fn; this.msg = msg }
  _typeName() { return 'effects' }
  _parse(v: unknown): { ok: boolean; value?: Infer<T>; path?: string; message?: string } {
    const r = this.inner._parse(v)
    if (!r.ok) return { ok: false, path: r.path ?? '', message: r.message ?? '' }
    if (!this.fn(r.value as Infer<T>)) return { ok: false, path: '', message: this.msg ?? 'refine failed' }
    return { ok: true, value: r.value as Infer<T> }
  }
}

export class ZodTransform<T extends ZodType, O2> extends ZodType<O2> {
  private readonly inner: T
  private readonly fn: (v: Infer<T>) => O2
  constructor(inner: T, fn: (v: Infer<T>) => O2) { super(); this.inner = inner; this.fn = fn }
  _typeName() { return 'transform' }
  _parse(v: unknown): { ok: boolean; value?: O2; path?: string; message?: string } {
    const r = this.inner._parse(v)
    if (!r.ok) return { ok: false, path: r.path ?? '', message: r.message ?? '' }
    return { ok: true, value: this.fn(r.value as Infer<T>) }
  }
}

// ── 入口 ──────────────────────────────────────────────────

export const z = {
  string: () => new ZodString(),
  number: () => new ZodNumber(),
  boolean: () => new ZodBoolean(),
  literal: <L extends string | number | boolean>(v: L) => new ZodLiteral(v),
  // W4：U 技巧（zod 官方）——数组字面量推断字面量 tuple（修复 ZodEnum<[string,string]> 坍缩）
  enum: <U extends string, T extends readonly [U, ...U[]]>(v: T) => new ZodEnum(v),
  date: () => new ZodDate(),
  uuid: () => new ZodString().uuid(),
  json: () => new ZodJson(),
  vector: (dims: number) => new ZodVector(dims),
  object: <S extends ZodRawShape>(shape: S) => new ZodObject(shape),
  array: <T extends ZodType>(item: T) => new ZodArray(item),
  union: <T extends [ZodType, ZodType, ...ZodType[]]>(opts: T) => new ZodUnion(opts),
  discriminatedUnion: <D extends string>(
    disc: D,
    options: [ZodObject<ZodRawShape>, ZodObject<ZodRawShape>, ...ZodObject<ZodRawShape>[]],
  ): ZodDiscriminatedUnion<D, Record<string, unknown>, typeof options> =>
    new ZodDiscriminatedUnion(disc, options, (shape) => discValueOf(shape, disc)),
}
