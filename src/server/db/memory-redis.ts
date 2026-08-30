/**
 * weifuwu/db — MemoryRedis：内存版 Redis（实现契约 Redis 接口）
 *
 * 用途：开发 / 测试 / 单实例部署（无 redis-server 依赖）——构造注入
 * 与真实 RedisPool 完全同构（queue / rateLimit / messager 参数直接替换）。
 *
 * 数据面：string（含 TTL）/ hash / list / set / zset / stream（消费组）/ pubsub。
 * 语义对齐真实 Redis（惰性 TTL 过期、XREADGROUP 投递进 pending、XAUTOCLAIM 认领）。
 *
 * 诚实裁剪（CS-05）：command() 支持 queue/rateLimit 用到的命令面；
 * 未实现命令抛 ProtocolError('unsupported')——绝不静默降级。
 * ⚠️ 仅供开发/测试/单实例——多实例一致性与持久化由真实 Redis 承担（文档红线）。
 */
import type { Redis, RedisPoolConnection, RedisPipelineFace } from './contracts.ts'
import type { RespValue } from './redis/resp.ts'
import type { RedisSubscriber } from './redis/subscriber.ts'
import { ProtocolError } from './errors.ts'
import { resolveCommand } from './redis/commands.ts'

interface MemoryEntry {
  id: string
  fields: Record<string, string>
  /** 消费组投递后记录：owner consumer + 认领用空闲时间戳（null = 已 XACK） */
  pending: { consumer: string; idleSince: number } | null
}

interface MemoryStream {
  entries: MemoryEntry[]
  /** group → 已投递到的 entry 序号（共享游标——多 consumer round-robin 由投递分配） */
  lastDelivered: Map<string, number>
}

/** 内存管道：收集命令 → exec 顺序执行（RedisPipelineFace 契约面——S5） */
class MemoryPipeline implements RedisPipelineFace {
  private cmds: { name: string; args: (string | number)[] }[] = []
  private redis: MemoryRedis
  constructor(redis: MemoryRedis) { this.redis = redis }
  set(key: string, value: string | number, ttl?: number): this {
    this.cmds.push(ttl !== undefined ? { name: 'SET', args: [key, value, 'EX', ttl] } : { name: 'SET', args: [key, value] })
    return this
  }
  get(key: string): this { this.cmds.push({ name: 'GET', args: [key] }); return this }
  del(...keys: string[]): this { this.cmds.push({ name: 'DEL', args: keys }); return this }
  incr(key: string): this { this.cmds.push({ name: 'INCR', args: [key] }); return this }
  expire(key: string, seconds: number): this { this.cmds.push({ name: 'EXPIRE', args: [key, seconds] }); return this }
  ttl(key: string): this { this.cmds.push({ name: 'TTL', args: [key] }); return this }
  raw(name: string, ...args: (string | number)[]): this { this.cmds.push({ name, args }); return this }
  async exec(): Promise<RespValue[]> {
    const cmds = this.cmds
    this.cmds = []
    const out: RespValue[] = []
    for (const c of cmds) {
      try {
        out.push(await this.redis.command(c.name, ...c.args))
      } catch (e) {
        out.push(e as never) // 错误命令对应位置为 Error（真库管道语义）
      }
    }
    return out
  }
}

/** 内存订阅者（RedisSubscriber 形状兼容）：psubscribe 模式匹配 + publish 派发 */
class MemorySubscriber {
  private subs = new Map<string, (channel: string, message: string) => void>()
  private connected = false
  private redis: MemoryRedis
  constructor(redis: MemoryRedis) {
    this.redis = redis
    redis._registerSubscriber(this)
  }
  async connect(): Promise<void> { this.connected = true }
  async subscribe(channel: string, fn: (channel: string, message: string) => void): Promise<void> {
    this.subs.set(`s:${channel}`, fn)
  }
  async psubscribe(pattern: string, fn: (channel: string, message: string) => void): Promise<void> {
    this.subs.set(`p:${pattern}`, fn)
  }
  async close(): Promise<void> { this.redis._unregisterSubscriber(this); this.subs.clear() }
  _dispatch(channel: string, message: string): boolean {
    if (!this.connected) return false
    let hit = false
    for (const [key, fn] of this.subs) {
      if (key.startsWith('s:')) {
        if (key.slice(2) === channel) { fn(channel, message); hit = true }
      } else {
        const pattern = key.slice(2)
        const re = new RegExp('^' + pattern.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
        if (re.test(channel)) { fn(channel, message); hit = true }
      }
    }
    return hit
  }
}

export class MemoryRedis implements Redis {
  private strings = new Map<string, { value: string; expiresAt: number | null }>()
  private hashes = new Map<string, Map<string, string>>()
  private lists = new Map<string, string[]>()
  private sets = new Map<string, Set<string>>()
  private zsets = new Map<string, Map<string, number>>()
  private streams = new Map<string, MemoryStream>()
  private subscribers = new Set<MemorySubscriber>()
  private seq = 0
  private closed = false

  // ── 内部注册（subscriber 生命周期） ──
  _registerSubscriber(sub: MemorySubscriber): void { this.subscribers.add(sub) }
  _unregisterSubscriber(sub: MemorySubscriber): void { this.subscribers.delete(sub) }

  /** 惰性过期检查：key 过期 → 删除并返回 true */
  private expired(key: string): boolean {
    const s = this.strings.get(key)
    if (!s || s.expiresAt === null) return false
    if (s.expiresAt <= Date.now()) {
      this.strings.delete(key)
      return true
    }
    return false
  }

  // ── Redis 接口：string ──────────────────────────────

  async get(key: string): Promise<string | null> {
    this.assertOpen()
    if (this.expired(key)) return null
    return this.strings.get(key)?.value ?? null
  }

  async getBuffer(key: string): Promise<Uint8Array | null> {
    const v = await this.get(key)
    return v === null ? null : new TextEncoder().encode(v)
  }

  async set(key: string, value: string | number, ttl?: number): Promise<'OK'> {
    this.assertOpen()
    this.strings.set(key, { value: String(value), expiresAt: ttl ? Date.now() + ttl * 1000 : null })
    return 'OK'
  }

  async del(...keys: string[]): Promise<number> {
    this.assertOpen()
    let n = 0
    for (const k of keys) {
      if (this.strings.delete(k)) n++
      if (this.hashes.delete(k)) n++
      if (this.lists.delete(k)) n++
      if (this.sets.delete(k)) n++
      if (this.zsets.delete(k)) n++
      if (this.streams.delete(k)) n++
    }
    return n
  }

  async incr(key: string): Promise<number> {
    this.assertOpen()
    // 同步读-写（消除 await 间隙——INCR 原子性契约：并发 INCR 各自原子——真库语义）
    const entry = this.strings.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.strings.delete(key) // 惰性过期（与 get 语义一致）
    }
    const cur = Number(this.strings.get(key)?.value ?? '0')
    // 非整数（真库 INCRBY 系列）→ 显式报错，不静默置 1（对齐真库 -ERR）
    if (!Number.isInteger(cur)) throw new ProtocolError('ERR value is not an integer or out of range')
    const next = cur + 1
    // 保留现有 TTL（rateLimit INCR + PEXPIRE 模式——INCR 不得清过期时间）
    this.strings.set(key, { value: String(next), expiresAt: this.strings.get(key)?.expiresAt ?? null })
    return next
  }

  async incrby(key: string, delta: number): Promise<number> {
    this.assertOpen()
    // 同步读-写（同 incr——原子性）
    const entry = this.strings.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.strings.delete(key)
    }
    const cur = Number(this.strings.get(key)?.value ?? '0')
    if (!Number.isInteger(cur) || !Number.isInteger(delta)) {
      throw new ProtocolError('ERR value is not an integer or out of range')
    }
    const next = cur + delta
    this.strings.set(key, { value: String(next), expiresAt: this.strings.get(key)?.expiresAt ?? null })
    return next
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.assertOpen()
    const s = this.strings.get(key)
    if (!s) return 0
    s.expiresAt = Date.now() + seconds * 1000
    return 1
  }

  async ttl(key: string): Promise<number> {
    this.assertOpen()
    const s = this.strings.get(key)
    if (!s) return -2
    if (s.expiresAt === null) return -1
    const ms = s.expiresAt - Date.now()
    return Math.max(0, Math.ceil(ms / 1000))
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((k) => this.get(k)))
  }

  async mset(...kv: (string | number)[]): Promise<'OK'> {
    this.assertOpen()
    for (let i = 0; i < kv.length; i += 2) {
      this.strings.set(String(kv[i]), { value: String(kv[i + 1]), expiresAt: null })
    }
    return 'OK'
  }

  async exists(...keys: string[]): Promise<number> {
    this.assertOpen()
    let n = 0
    for (const k of keys) if ((await this.get(k)) !== null) n++
    return n
  }

  async setnx(key: string, value: string | number): Promise<number> {
    this.assertOpen()
    // 同步读-写（无 await 间隙——SETNX 原子性契约：并发恰一个成功——分布式锁语义）
    const entry = this.strings.get(key)
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.strings.delete(key) // 惰性过期（与 get 语义一致）
    }
    if (this.strings.has(key)) return 0
    this.strings.set(key, { value: String(value), expiresAt: null })
    return 1
  }

  // ── Redis 接口：json / cache ─────────────────────────

  async jsonGet(key: string): Promise<unknown | null> {
    const v = await this.get(key)
    if (v === null) return null
    try { return JSON.parse(v) } catch { return v }
  }

  async jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'> {
    return this.set(key, JSON.stringify(value), ttl)
  }

  async cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null> {
    const hit = await this.get(key)
    if (hit !== null) {
      try { return JSON.parse(hit) as T } catch { return hit as unknown as T }
    }
    const val = await fn()
    if (val !== null) await this.jsonSet(key, val, ttl)
    return val
  }

  // ── Redis 接口：hash ─────────────────────────────────

  async hset(key: string, field: string, value: string | number): Promise<number> {
    this.assertOpen()
    let h = this.hashes.get(key)
    if (!h) { h = new Map(); this.hashes.set(key, h) }
    const created = !h.has(field)
    h.set(field, String(value))
    return created ? 1 : 0
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.assertOpen()
    return this.hashes.get(key)?.get(field) ?? null
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.assertOpen()
    const h = this.hashes.get(key)
    if (!h) return {}
    return Object.fromEntries(h)
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.assertOpen()
    const h = this.hashes.get(key)
    if (!h) return 0
    let n = 0
    for (const f of fields) if (h.delete(f)) n++
    if (h.size === 0) this.hashes.delete(key)
    return n
  }

  // ── Redis 接口：list ─────────────────────────────────

  private list(key: string): string[] {
    let l = this.lists.get(key)
    if (!l) { l = []; this.lists.set(key, l) }
    return l
  }

  async lpush(key: string, ...values: (string | number)[]): Promise<number> {
    this.assertOpen()
    const l = this.list(key)
    for (const v of values) l.unshift(String(v))
    return l.length
  }

  async rpush(key: string, ...values: (string | number)[]): Promise<number> {
    this.assertOpen()
    const l = this.list(key)
    for (const v of values) l.push(String(v))
    return l.length
  }

  async lpop(key: string): Promise<string | null> {
    this.assertOpen()
    const l = this.lists.get(key)
    if (!l || l.length === 0) return null
    const v = l.shift()!
    if (l.length === 0) this.lists.delete(key)
    return v
  }

  async rpop(key: string): Promise<string | null> {
    this.assertOpen()
    const l = this.lists.get(key)
    if (!l || l.length === 0) return null
    const v = l.pop()!
    if (l.length === 0) this.lists.delete(key)
    return v
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.assertOpen()
    const l = this.lists.get(key) ?? []
    const s = start < 0 ? Math.max(0, l.length + start) : start
    const e = stop < 0 ? l.length + stop : Math.min(l.length - 1, stop)
    if (s > e) return []
    return l.slice(s, e + 1)
  }

  // ── Redis 接口：set ──────────────────────────────────

  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    this.assertOpen()
    let st = this.sets.get(key)
    if (!st) { st = new Set(); this.sets.set(key, st) }
    let n = 0
    // 返回新增数（已存在成员不计——真库 SADD 语义）
    for (const m of members) {
      const s = String(m)
      if (!st.has(s)) { st.add(s); n++ }
    }
    return n
  }

  async srem(key: string, ...members: (string | number)[]): Promise<number> {
    this.assertOpen()
    const st = this.sets.get(key)
    if (!st) return 0
    let n = 0
    for (const m of members) if (st.delete(String(m))) n++
    if (st.size === 0) this.sets.delete(key)
    return n
  }

  async smembers(key: string): Promise<string[]> {
    this.assertOpen()
    return [...(this.sets.get(key) ?? [])]
  }

  // ── Redis 接口：zset ─────────────────────────────────

  async zadd(key: string, score: number, member: string | number): Promise<number> {
    this.assertOpen()
    let z = this.zsets.get(key)
    if (!z) { z = new Map(); this.zsets.set(key, z) }
    const m = String(member)
    const created = !z.has(m)
    z.set(m, score)
    return created ? 1 : 0
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    this.assertOpen()
    const z = this.zsets.get(key)
    if (!z) return []
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m)
    const s = start < 0 ? Math.max(0, sorted.length + start) : start
    const e = stop < 0 ? sorted.length + stop : Math.min(sorted.length - 1, stop)
    return s > e ? [] : sorted.slice(s, e + 1)
  }

  // ── Redis 接口：pubsub / 生命周期 ────────────────────

  async publish(channel: string, message: string | number): Promise<number> {
    this.assertOpen()
    const msg = String(message)
    let n = 0
    for (const sub of this.subscribers) {
      if (sub._dispatch(channel, msg)) n++ // 返回匹配接收数（真库 PUBLISH 语义——非订阅者总数）
    }
    return n
  }

  async pipeline(): Promise<RedisPipelineFace> {
    return new MemoryPipeline(this)
  }

  createSubscriber(): RedisSubscriber {
    return new MemorySubscriber(this) as unknown as RedisSubscriber
  }

  /**
   * 独立连接视图：queue worker 的 stop 会 close 连接——视图 close 不关底层
   * （所有权在创建者：MemoryRedis 实例由调用方管理）。
   */
  async createConnection(): Promise<RedisPoolConnection> {
    this.assertOpen()
    const redis = this
    return {
      get connected(): boolean { return !redis.closed },
      command: (name: string, ...args: (string | number)[]) => redis.command(name, ...args),
      close: async () => { /* 视图关闭 no-op——底层所有权在外 */ },
    }
  }

  async flushdb(): Promise<'OK'> {
    this.assertOpen()
    this.strings.clear(); this.hashes.clear(); this.lists.clear()
    this.sets.clear(); this.zsets.clear(); this.streams.clear()
    return 'OK'
  }

  async close(): Promise<void> {
    this.closed = true
    for (const sub of this.subscribers) sub.close().catch(() => {})
    this.subscribers.clear()
  }

  private assertOpen(): void {
    if (this.closed) throw new ProtocolError('memory-redis: instance is closed')
  }


  // ── command 派发（queue/rateLimit 原始命令面） ────────

  async command(name: string, ...args: (string | number)[]): Promise<RespValue> {
    this.assertOpen()
    // 命令注册表前置校验：unknown/arity 抛（对齐真库 -ERR 可预测失败）
    resolveCommand({ name, args })
    const [a, b, c, d, e] = args as (string | number | undefined)[]
    switch (name.toUpperCase()) {
      // string
      case 'GET': return this.get(String(a))
      // list（服务器 BLPOP/LPUSH 语义）
      case 'LPUSH': return this.lpush(String(a), ...(args.slice(1) as (string | number)[]))
      case 'RPUSH': return this.rpush(String(a), ...(args.slice(1) as (string | number)[]))
      case 'LPOP': return this.lpop(String(a))
      case 'RPOP': return this.rpop(String(a))
      case 'LLEN': return this.lists.get(String(a))?.length ?? 0
      case 'LRANGE': return this.lrange(String(a), Number(b), Number(c))
      case 'SET': return this.set(String(a), String(b), c !== undefined ? Number(c === 'EX' ? d : c) : undefined)
      case 'DEL': return this.del(...args.map(String))
      case 'INCR': return this.incr(String(a))
      case 'EXPIRE': return this.expire(String(a), Number(b))
      case 'PEXPIRE': {
        // 毫秒级 TTL 直接设 expiresAt（不经秒转换——窗口过期测试 500ms 精度）
        const s = this.strings.get(String(a))
        if (!s) return 0
        s.expiresAt = Date.now() + Number(b)
        return 1
      }
      case 'TTL': return this.ttl(String(a))
      case 'FLUSHDB': return this.flushdb()

      // zset（delayed queue / sliding）
      case 'ZADD': return this.zadd(String(a), Number(b), String(c))
      case 'ZRANGEBYSCORE': {
        const z = this.zsets.get(String(a))
        if (!z) return []
        const min = Number(b); const max = Number(c)
        return [...z.entries()].filter(([, s]) => s >= min && s <= max).sort((x, y) => x[1] - y[1]).map(([m]) => m)
      }
      case 'ZREM': return this.zrem(String(a), String(b))
      case 'ZCARD': return this.zsets.get(String(a))?.size ?? 0
      case 'ZREMRANGEBYSCORE': return this.zremrangebyscore(String(a), Number(b), Number(c))

      // stream（queue 消费组）
      case 'XADD': return this.xadd(String(a), String(b), args.slice(2)) // [key, id, field, value, ...]
      case 'XLEN': return this.streams.get(String(a))?.entries.length ?? 0
      case 'XGROUP': {
        // 格式：XGROUP SUBCOMMAND key group [start]——key 是第二参数
        const sub = String(a).toUpperCase()
        if (sub === 'DESTROY') return this.xgroupDestroy(String(b), String(c))
        return this.xgroup(String(b), String(c), String(d))
      }
      case 'XREADGROUP': return this.xreadgroup(String(a), String(b), String(c), args) as unknown as RespValue
      case 'XACK': return this.xack(String(a), String(b), String(c))
      case 'XAUTOCLAIM': return this.xautoclaim(String(a), String(b), String(c), Number(d), args) as unknown as RespValue
      case 'XPENDING': return this.xpending(String(a), String(b)) as unknown as RespValue

      default:
        throw new ProtocolError(`memory-redis: command '${name}' unsupported (诚实裁剪——需真库/补实现)`)
    }
  }

  private async zrem(key: string, member: string): Promise<number> {
    const z = this.zsets.get(key)
    if (!z) return 0
    const n = z.delete(member) ? 1 : 0
    if (z.size === 0) this.zsets.delete(key)
    return n
  }

  private async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const z = this.zsets.get(key)
    if (!z) return 0
    let n = 0
    for (const [m, s] of [...z.entries()]) {
      if (s >= min && s <= max) { z.delete(m); n++ }
    }
    if (z.size === 0) this.zsets.delete(key)
    return n
  }

  // ── stream 实现 ──────────────────────────────────────

  private stream(key: string): MemoryStream {
    let st = this.streams.get(key)
    if (!st) { st = { entries: [], lastDelivered: new Map() }; this.streams.set(key, st) }
    return st
  }

  /** XADD stream * field value ... → id */
  private async xadd(key: string, id: string, kv: (string | number)[]): Promise<string> {
    const st = this.stream(key)
    if (id === '*') id = `${Date.now()}-${this.seq++}`
    const fields: Record<string, string> = {}
    for (let i = 0; i < kv.length; i += 2) fields[String(kv[i])] = String(kv[i + 1])
    st.entries.push({ id, fields, pending: null })
    return id
  }

  /** XGROUP CREATE key group '0' [MKSTREAM] → 'OK'；已存在抛 BUSYGROUP；key 非 stream 抛 WRONGTYPE */
  private async xgroup(key: string, group: string, startId: string): Promise<'OK'> {
    if (this.strings.has(key) && !this.streams.has(key)) {
      throw new Error(`WRONGTYPE Operation against a key holding the wrong kind of value`)
    }
    const st = this.stream(key)
    if (st.lastDelivered.has(group)) {
      throw new Error(`BUSYGROUP Consumer Group name already exists: ${group}`)
    }
    // '$' = 只投新（游标 = 现有末尾）；'0' = 从首条投递（真库起始语义）
    st.lastDelivered.set(group, startId === '$' ? st.entries.length : 0)
    return 'OK'
  }

  /** XGROUP DESTROY key group → 1（删除消费组——queue 自愈测试） */
  private async xgroupDestroy(key: string, group: string): Promise<number> {
    const st = this.streams.get(key)
    if (!st) return 0
    return st.lastDelivered.delete(group) ? 1 : 0
  }

  /** XREADGROUP GROUP g c COUNT n BLOCK ms STREAMS key '>' → [[key, [[id,[k,v,...]],...]]] | null */
  private async xreadgroup(_key: string, group: string, _consumer: string, all: (string | number)[]): Promise<unknown> {
    const idx = all.indexOf('STREAMS')
    const streamKey = String(all[idx + 1]) // key 在 STREAMS 之后（首参是 'GROUP'）
    const st = this.stream(streamKey)
    const countIdx = all.indexOf('COUNT')
    const count = countIdx >= 0 ? Number(all[countIdx + 1]) : 1
    const blockIdx = all.indexOf('BLOCK')
    const blockMs = blockIdx >= 0 ? Number(all[blockIdx + 1]) : 0
    const delivery = String(all[idx + 2])

    const last = st.lastDelivered.get(group)
    if (delivery === '>') {
      // 共享游标投递：从 lastDelivered 序号之后、未 pending 的 entry 分发
      const startIdx = typeof last === 'number' ? last : 0
      const candidates = st.entries.slice(startIdx).filter((en) => !en.pending)
      if (candidates.length === 0) {
        if (blockMs > 0) {
          await new Promise((r) => setTimeout(r, blockMs))
          // BLOCK 苏醒后重新读取游标——期间其他 consumer 可能已投递并前进
          // （XACK 清 pending 不清游标——游标单调前进不回溯，防重投）
          const cur = st.lastDelivered.get(group)
          const resume = typeof cur === 'number' ? cur : 0
          const again = st.entries.slice(resume).filter((en) => !en.pending)
          if (again.length === 0) return null
          const taken = again.slice(0, count)
          for (const en of taken) { en.pending = { consumer: _consumer, idleSince: Date.now() } }
          st.lastDelivered.set(group, resume + taken.length)
          return [[streamKey, taken.map((en) => [en.id, flatFields(en.fields)])]]
        }
        return null
      }
      const taken = candidates.slice(0, count)
      for (const en of taken) { en.pending = { consumer: _consumer, idleSince: Date.now() } }
      st.lastDelivered.set(group, startIdx + taken.length)
      return [[streamKey, taken.map((en) => [en.id, flatFields(en.fields)])]]
    }
    // delivery = '0'：读自己的 pending（queue 未用——保持最小）
    const mine = st.entries.filter((en) => en.pending?.consumer === _consumer)
    return [[streamKey, mine.slice(0, count).map((en) => [en.id, flatFields(en.fields)])]]
  }

  /** XACK key group id... → 已确认数 */
  private async xack(key: string, group: string, ...ids: string[]): Promise<number> {
    const st = this.streams.get(key)
    if (!st) return 0
    let n = 0
    for (const id of ids) {
      const en = st.entries.find((x) => x.id === id)
      if (en?.pending) { en.pending = null; n++ }
    }
    return n
  }

  /** XAUTOCLAIM key group consumer minIdle start COUNT n → [cursor, [[id,[k,v,...]],...]] */
  private async xautoclaim(key: string, group: string, consumer: string, minIdle: number, all: (string | number)[]): Promise<unknown[]> {
    const st = this.streams.get(key)
    if (!st) return ['0-0', []]
    const countIdx = all.indexOf('COUNT')
    const count = countIdx >= 0 ? Number(all[countIdx + 1]) : 1
    const now = Date.now()
    const stale = st.entries.filter((en) => en.pending && now - en.pending.idleSince >= minIdle)
    const taken = stale.slice(0, count)
    for (const en of taken) {
      en.pending = { consumer, idleSince: now }
    }
    return ['0-0', taken.map((en) => [en.id, flatFields(en.fields)])]
  }

  /** XPENDING key group → summary 形状（真库语义：[count, minId, maxId, [[consumer, count]]]） */
  private async xpending(key: string, group: string): Promise<unknown[]> {
    const st = this.streams.get(key)
    if (!st) return [0, '0-0', '0-0', []]
    const pending = st.entries.filter((en) => en.pending)
    if (pending.length === 0) return [0, '0-0', '0-0', []]
    const byConsumer = new Map<string, number>()
    for (const en of pending) {
      const c = en.pending!.consumer
      byConsumer.set(c, (byConsumer.get(c) ?? 0) + 1)
    }
    return [
      pending.length,
      pending[0].id,
      pending[pending.length - 1].id,
      [...byConsumer.entries()].map(([c, n]) => [c, n]),
    ]
  }
}

/** [k,v,k,v,...] 扁平数组 → Record（queue flatFieldsToRecord 的输入形状） */
function flatFields(fields: Record<string, string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(fields)) out.push(k, v)
  return out
}
