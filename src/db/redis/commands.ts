/**
 * weifuwu/db — Redis 命令注册表（类型化命令面）
 *
 * 以 AST 为中心的执行层：RedisCommand（{ name, args }）→ 注册表校验（arity/类型化
 * 参数规范化）→ 执行处理器。MemoryRedis 与 MemoryRedisServer 共享注册表——
 * 命令定义零重复。
 *
 * 设计：
 *   - arity：最小/最大参数数（如 GET 1 参数、SET 2..4 参数）
 *   - parse：类型化参数规范化（SET 的 EX/PX 秒毫秒转换、BLPOP 超时）
 *   - 语义参数错误抛 ProtocolError（对齐真库 -ERR 可预测失败）
 */
import { ProtocolError } from '../errors.ts'

export interface ParsedCommand {
  /** 规范化后的参数（parse 后） */
  args: (string | number)[]
  /** 可选：类型化提取（如 ttl 毫秒） */
  meta?: Record<string, string | number | boolean>
}

export interface CommandDef {
  name: string
  /** 最小参数数（命令名后的参数个数） */
  minArity: number
  /** 最大参数数（undefined = 不限） */
  maxArity?: number
  /** 类型化参数解析——校验失败抛 ProtocolError（可预测失败） */
  parse?(args: (string | number)[]): ParsedCommand
}

const defs: CommandDef[] = [
  // ── string ──
  { name: 'GET', minArity: 1, maxArity: 1 },
  {
    name: 'SET',
    minArity: 2,
    maxArity: 5,
    parse(args) {
      const [key, value, ...rest] = args
      let ttl: number | undefined
      let keepTtl = false
      for (let i = 0; i < rest.length; i += 2) {
        const opt = String(rest[i]).toUpperCase()
        const v = rest[i + 1]
        if (opt === 'EX' && v !== undefined) ttl = Number(v) * 1000
        else if (opt === 'PX' && v !== undefined) ttl = Number(v)
        else if (opt === 'KEEPTTL') keepTtl = true
        else throw new ProtocolError(`ERR syntax error: SET 选项 ${opt} 不支持`)
      }
      if (ttl !== undefined && !Number.isFinite(ttl)) throw new ProtocolError('ERR value is not an integer or out of range')
      const meta: { ttl?: number; keepTtl: boolean } = { keepTtl }
      if (ttl !== undefined) meta.ttl = ttl
      return { args: [String(key), String(value)], meta }
    },
  },
  { name: 'EXISTS', minArity: 1 },
  { name: 'DEL', minArity: 1 },
  {
    name: 'EXPIRE',
    minArity: 2,
    maxArity: 3,
    parse(args) {
      return { args: [String(args[0]), String(args[1])], meta: { ttlMs: Number(args[1]) * 1000 } }
    },
  },
  {
    name: 'PEXPIRE',
    minArity: 2,
    maxArity: 3,
    parse(args) {
      return { args: [String(args[0]), String(args[1])], meta: { ttlMs: Number(args[1]) } }
    },
  },
  { name: 'TTL', minArity: 1, maxArity: 1 },
  { name: 'INCR', minArity: 1, maxArity: 1 },
  { name: 'INCRBY', minArity: 2, maxArity: 2 },
  { name: 'STRLEN', minArity: 1, maxArity: 1 },
  { name: 'APPEND', minArity: 2, maxArity: 2 },
  { name: 'MGET', minArity: 1 },
  { name: 'MSET', minArity: 2 },

  // ── hash ──
  { name: 'HSET', minArity: 3 },
  { name: 'HGET', minArity: 2, maxArity: 2 },
  { name: 'HDEL', minArity: 2 },
  { name: 'HGETALL', minArity: 1, maxArity: 1 },
  { name: 'HEXISTS', minArity: 2, maxArity: 2 },
  { name: 'HLEN', minArity: 1, maxArity: 1 },
  { name: 'HKEYS', minArity: 1, maxArity: 1 },
  { name: 'HVALS', minArity: 1, maxArity: 1 },
  { name: 'HINCRBY', minArity: 3, maxArity: 3 },

  // ── list ──
  { name: 'LPUSH', minArity: 2 },
  { name: 'RPUSH', minArity: 2 },
  { name: 'LPOP', minArity: 1, maxArity: 2 },
  { name: 'RPOP', minArity: 1, maxArity: 2 },
  { name: 'LLEN', minArity: 1, maxArity: 1 },
  { name: 'LRANGE', minArity: 3, maxArity: 3 },
  { name: 'LSET', minArity: 3, maxArity: 3 },
  { name: 'LINDEX', minArity: 2, maxArity: 2 },
  {
    name: 'BLPOP',
    minArity: 2,
    parse(args) {
      const timeout = Number(args[args.length - 1])
      if (!Number.isFinite(timeout)) throw new ProtocolError('ERR timeout is not a float')
      return { args: args.map(String), meta: { timeoutMs: timeout * 1000 } }
    },
  },

  // ── set ──
  { name: 'SADD', minArity: 2 },
  { name: 'SREM', minArity: 2 },
  { name: 'SMEMBERS', minArity: 1, maxArity: 1 },
  { name: 'SISMEMBER', minArity: 2, maxArity: 2 },
  { name: 'SCARD', minArity: 1, maxArity: 1 },

  // ── zset ──
  { name: 'ZADD', minArity: 3 },
  { name: 'ZREM', minArity: 2 },
  { name: 'ZRANGE', minArity: 3 },
  { name: 'ZRANGEBYSCORE', minArity: 3 },
  { name: 'ZREMRANGEBYSCORE', minArity: 3, maxArity: 3 },
  { name: 'ZCARD', minArity: 1, maxArity: 1 },
  { name: 'ZSCORE', minArity: 2, maxArity: 2 },

  // ── stream ──
  { name: 'XADD', minArity: 4 },
  { name: 'XREADGROUP', minArity: 5 },
  { name: 'XACK', minArity: 3 },
  { name: 'XPENDING', minArity: 2 },
  { name: 'XAUTOCLAIM', minArity: 5 },
  { name: 'XGROUP', minArity: 3 },
  { name: 'XLEN', minArity: 1, maxArity: 1 },
  { name: 'XRANGE', minArity: 3 },
  { name: 'XDEL', minArity: 2 },

  // ── pubsub ──
  { name: 'SUBSCRIBE', minArity: 1 },
  { name: 'UNSUBSCRIBE', minArity: 0 },
  { name: 'PSUBSCRIBE', minArity: 1 },
  { name: 'PUNSUBSCRIBE', minArity: 0 },
  { name: 'PUBLISH', minArity: 2, maxArity: 2 },

  // ── connection / misc ──
  { name: 'PING', minArity: 0 },
  { name: 'ECHO', minArity: 1, maxArity: 1 },
  { name: 'SELECT', minArity: 1, maxArity: 1 },
  { name: 'FLUSHALL', minArity: 0 },
  { name: 'FLUSHDB', minArity: 0 },
  { name: 'CLIENT', minArity: 1 },
  { name: 'INFO', minArity: 0 },
  { name: 'TIME', minArity: 0 },
  { name: 'DBSIZE', minArity: 0 },
  { name: 'AUTH', minArity: 1, maxArity: 2 },
  { name: 'QUIT', minArity: 0 },
]

const table = new Map(defs.map((d) => [d.name, d]))

/**
 * 注册表校验 + 参数规范化。
 * 未注册命令：抛 ProtocolError('unknown command')（可预测失败——诚实裁剪）。
 */
export function resolveCommand(cmd: { name: string; args: (string | number)[] }): { def: CommandDef; parsed: ParsedCommand } {
  const name = cmd.name.toUpperCase()
  const def = table.get(name)
  if (!def) throw new ProtocolError(`ERR unknown command '${name}'`)
  if (cmd.args.length < def.minArity) {
    throw new ProtocolError(`ERR wrong number of arguments for '${name}' command`)
  }
  if (def.maxArity !== undefined && cmd.args.length > def.maxArity) {
    throw new ProtocolError(`ERR wrong number of arguments for '${name}' command`)
  }
  return { def, parsed: def.parse ? def.parse(cmd.args) : { args: cmd.args } }
}

/** 注册扩展命令（测试/自定义） */
export function registerCommand(def: CommandDef): void {
  table.set(def.name, def)
}
