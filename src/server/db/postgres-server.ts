/**
 * weifuwu/db — MemoryPostgresServer：内存 Postgres 服务器（PG v3 线协议）
 *
 * 进程内 TCP 服务器——客户端（PgConnection/PgPool）零改动直连：
 *   startup 握手（AuthenticationOk + ParameterStatus + ReadyForQuery）→
 *   简单查询（Q）/ 扩展查询（Parse/Bind/Execute/Sync）→ MemorySql 执行 →
 *   编码 RowDescription/DataRow/CommandComplete/ErrorResponse
 *
 * 类型 OID 推断（RowDescription）：由 MemorySql 行值类型推导——
 *   number 整数 → int8(20)、小数 → float8(701)、boolean → bool(16)、
 *   object → jsonb(3802)、string → text(25)、null → text(25)
 *   （客户端 connection.ts 按 OID 做类型转换——测试验证映射正确性）
 *
 * 诚实裁剪：不支持的消息类型/认证（SCRAM 等）→ 错误响应（可预测失败）。
 */
import net from 'node:net'
import type { Socket } from 'node:net'
import { MemorySql } from './memory-sql.ts'
import type { Row } from './contracts.ts'
import { MessageStream, encodeMessage, type Message } from './postgres/protocol.ts'
import { ProtocolError } from './errors.ts'
import type { MemorySnapshot } from './memory-sql.ts'
import type { DBServer } from './server.ts'

export interface PostgresServerOptions {
  /** 监听端口（0 = 随机）。默认 0。 */
  port?: number
  /** 认证口令（无密码 = AuthenticationOk 直过）。默认无。 */
  password?: string
  /** 数据库名（startup 参数校验）。默认接受任意。 */
  database?: string
}

// ── PG 类型 OID ──────────────────────────────────────────
const OID = {
  INT8: 20, INT2: 21, INT4: 23, FLOAT4: 700, FLOAT8: 701,
  NUMERIC: 1700, JSON: 114, JSONB: 3802, BOOL: 16, TEXT: 25,
  UUID: 2950, TIMESTAMPTZ: 1184, TIMESTAMP: 1114, DATE: 1082,
} as const

const _encoder = new TextEncoder()
const _decoder = new TextDecoder()

/** 按值推断列 OID */
/** Bind 参数按 Parse paramTypes 转换（对齐真库类型映射） */
function convertParam(raw: string, oid: number): unknown {
  switch (oid) {
    case OID.INT2:
    case OID.INT4:
    case OID.INT8:
    case OID.FLOAT4:
    case OID.FLOAT8:
    case OID.NUMERIC:
      return raw === '' ? null : Number(raw)
    case OID.BOOL:
      return raw === 't' || raw === 'true'
    case OID.JSONB:
    case OID.JSON:
      try { return JSON.parse(raw) } catch { return raw }
    default:
      return raw
  }
}

/** SQL 类型字符串 → OID（Describe 无 cast 时查表列类型） */
function typeOid(t: string): number {
  if (t.includes('int')) return t === 'bigint' || t === 'int8' ? OID.INT8 : OID.INT4
  if (t.includes('float') || t.includes('numeric') || t.includes('decimal')) return OID.FLOAT8
  if (t.includes('bool')) return OID.BOOL
  if (t.includes('json')) return OID.JSONB
  if (t.includes('uuid')) return OID.UUID
  if (t.includes('timestamptz')) return OID.TIMESTAMPTZ
  if (t.includes('timestamp')) return OID.TIMESTAMP
  if (t.includes('date')) return OID.DATE
  return OID.TEXT
}

function inferOid(v: unknown): number {
  if (v !== null && typeof v === 'object') return OID.JSONB
  if (typeof v === 'number') return Number.isInteger(v) ? OID.INT8 : OID.FLOAT8
  if (typeof v === 'boolean') return OID.BOOL
  if (typeof v === 'object' && v !== null) return OID.JSONB
  return OID.TEXT
}

/** per-connection 协议状态（handleMessage ctx 对象——消灭 getter/setter 参数表） */
interface PgConnState {
  authed: boolean
  inTransaction: boolean
  pendingParse: { name: string; sql: string; paramTypes: number[]; bindParams: unknown[] | null } | null
  pendingExecute: Promise<void> | null
}

export class MemoryPostgresServer implements DBServer {
  port = 0
  url = ''
  private server: net.Server | null = null
  private engine = new MemorySql()
  private opts: Required<Pick<PostgresServerOptions, 'port' | 'password'>>
  private closed = false
  private queryLog: string[] = []
  private txSnap: MemorySnapshot | null = null
  /** 存活连接（close 时全量销毁——server.close 只停 accept，不等存量连接） */
  private sockets = new Set<Socket>()
  /** 命名 prepared statement 缓存（客户端复用——同 sql 不发 Parse） */
  private statements = new Map<string, { sql: string; paramTypes: number[]; bindParams: unknown[] | null }>()
  /** portal → statement 绑定（Bind 创建、Execute 按 portal 执行——客户端 portal 通常空名） */
  private portals = new Map<string, { sql: string; paramTypes: number[]; bindParams: unknown[] | null }>()

  constructor(options: PostgresServerOptions = {}) {
    this.opts = { port: options.port ?? 0, password: options.password ?? '' }
  }

  async start(): Promise<void> {
    if (this.server) return
    await new Promise<void>((resolve) => {
      this.server = net.createServer((sock) => this.handleSocket(sock))
      this.server.listen(this.opts.port, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo
        this.port = addr.port
        this.url = `postgres://postgres@127.0.0.1:${addr.port}/demo`
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const sock of this.sockets) sock.destroy() // 存量连接全量销毁（否则 close 永久挂起）
    this.sockets.clear()
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  /** 测试辅助：执行过的 SQL 列表 */
  get queries(): string[] {
    return [...this.queryLog]
  }

  private handleSocket(sock: Socket): void {
    const stream = new MessageStream() // 有状态增量解析（每连接实例）
    const state: PgConnState = {
      authed: this.opts.password === '',
      inTransaction: false,
      pendingParse: null,
      pendingExecute: null,
    }
    let startupBuf = Buffer.alloc(0)
    let startupDone = false
    this.sockets.add(sock)
    sock.on('close', () => this.sockets.delete(sock))
    sock.on('error', () => this.sockets.delete(sock))

    sock.on('data', (chunk) => {
      if (!startupDone) {
        // startup 消息：4 字节 length + payload（无 type 字节——协议特殊）
        startupBuf = Buffer.concat([startupBuf, Buffer.from(chunk as Uint8Array)])
        if (startupBuf.length < 4) return
        const len = startupBuf.readUInt32BE(0) // 消息总长（含 4 字节 length 字段）
        if (startupBuf.length < len) return
        this.handleStartup(sock, startupBuf.subarray(4, len))
        startupDone = true
        return
      }
      const messages = stream.push(chunk as Uint8Array)
      for (const msg of messages) {
        this.handleMessage(sock, msg, state)
      }
    })
  }

  /** startup：196608（协议 3.0）+ 参数 k\0v\0... */
  private handleStartup(sock: Socket, payload: Uint8Array): void {
    const version = (payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3]
    if (version !== 196608) {
      sock.write(errorResponse('0A000', 'unsupported protocol version'))
      return
    }
    if (this.opts.password === '') {
      sock.write(encodeMessage('R', u32(0))) // AuthenticationOk
      sock.write(encodeMessage('S', concat(cstr('server_version'), cstr('16.0-memory'))))
      sock.write(encodeMessage('S', concat(cstr('client_encoding'), cstr('UTF8'))))
      sock.write(encodeMessage('Z', _encoder.encode('I')))
    } else {
      sock.write(encodeMessage('R', u32(3))) // cleartext password 请求
    }
  }

  private handleMessage(
    sock: Socket,
    msg: Message,
    state: PgConnState,
  ): void {
    const getParse = () => state.pendingParse
    const setParse = (p: PgConnState['pendingParse']) => { state.pendingParse = p }
    const getTx = () => state.inTransaction
    const setTx = (t: boolean) => { state.inTransaction = t }
    const getExec = () => state.pendingExecute
    const setExec = (p: Promise<void> | null) => { state.pendingExecute = p }
    if (!state.authed) {
      if (msg.type === 'p') {
        // password message（cleartext 认证）
        const pw = Buffer.from((msg.payload as Uint8Array).subarray(0, (msg.payload as Uint8Array).indexOf(0))).toString('utf8')
        if (pw === this.opts.password) {
          sock.write(encodeMessage('R', u32(0)))
          sock.write(encodeMessage('S', concat(cstr('server_version'), cstr('16.0-memory'))))
          sock.write(encodeMessage('Z', _encoder.encode('I')))
          state.authed = true
        } else {
          sock.write(errorResponse('28P01', 'password authentication failed for user "postgres"'))
        }
      }
      return
    }

    switch (msg.type) {
      case 'Q': {
        // 简单查询
        const sql = Buffer.from((msg.payload as Uint8Array).subarray(0, (msg.payload as Uint8Array).indexOf(0))).toString('utf8').replace(/;$/, '')
        this.queryLog.push(sql)
        void this.runQuery(sock, sql, [], getTx, setTx)
        break
      }
      case 'P': {
        // Parse：name\0 sql\0 paramTypes
        const parts = msg.payload
        const name = cstrOf(parts, 0)
        const sql = cstrOf(parts, name.length + 1)
        // ParameterDescription（'t'）：参数数 + OID（客户端据此发 Bind+Execute+Sync）
        const paramCount = countParams(sql)
        const oids = paramTypesFromSql(sql, paramCount, this.engine)
        this.statements.set(name, { sql, paramTypes: oids, bindParams: null })
        setParse({ name, sql, paramTypes: oids, bindParams: null })
        sock.write(encodeMessage('1', _encoder.encode(''))) // ParseComplete
        sock.write(encodeMessage('t', paramDescription(paramCount, oids)))
        break
      }
      case 'B': {
        // Bind payload: portal\0 stmt\0 fmtCount(2)+formats paramCount(2) + (len(4)+bytes)* resultFmtCount(2)
        let off = 0
        // portal\0
        const portal = cstrOf(msg.payload, 0)
        off = portal.length + 1
        // stmt\0（命名 statement 缓存——客户端复用时不发 Parse）
        const stmtName = cstrOf(msg.payload, off)
        off += stmtName.length + 1
        const parse = getParse() ?? { name: stmtName, ...(this.statements.get(stmtName) ?? { sql: '', paramTypes: [], bindParams: null }) }
        const bindTarget: { sql: string; paramTypes: number[]; bindParams: unknown[] | null } = parse ?? { sql: '', paramTypes: [], bindParams: null }
        // fmtCount + formats
        const fmtCount = (msg.payload[off] << 8) | msg.payload[off + 1]
        off += 2 + fmtCount * 2
        // paramCount
        const paramCount = (msg.payload[off] << 8) | msg.payload[off + 1]
        off += 2
        const params: unknown[] = []
        for (let i = 0; i < paramCount; i++) {
          const len = (((msg.payload[off] << 24) | (msg.payload[off + 1] << 16) | (msg.payload[off + 2] << 8) | msg.payload[off + 3]) >>> 0)
          off += 4
          if (len === 0xffffffff) {
            params.push(null)
          } else {
            const raw = _decoder.decode(msg.payload.subarray(off, off + len))
            // 按 Parse 的 paramTypes 转换（int→Number、bool→boolean、jsonb→object）
            const oid = parse?.paramTypes[i] ?? OID.TEXT
            params.push(convertParam(raw, oid))
            off += len
          }
        }
        if (parse) parse.bindParams = params
        bindTarget.bindParams = params
        this.portals.set(portal, { sql: bindTarget.sql, paramTypes: bindTarget.paramTypes, bindParams: params })
        sock.write(encodeMessage('2', _encoder.encode(''))) // BindComplete
        break
      }
      case 'D': {
        // Describe（P statement / S portal）：回 RowDescription（静态列名提取——不依赖 Bind 参数）
        const parse = getParse()
        if (!parse || (!/^SELECT/.test(parse.sql.trim().toUpperCase()) && !/RETURNING/.test(parse.sql))) {
          sock.write(encodeMessage('n', _encoder.encode(''))) // NoData
          break
        }
        const cols = extractColumns(parse.sql)
        const oids = cols.map((c) => {
          const cast = inferOidFromSql(parse.sql, c)
          if (cast !== OID.TEXT) return cast
          // 无 cast：查表列类型（CREATE 记忆）——值推断需 Execute 后，协议不允许
          const tbl = /^SELECT\s+.*\s+FROM\s+(\w+)/i.exec(parse.sql)?.[1]
          const t = tbl ? this.engine.getColumnType(tbl, c) : undefined
          if (t) return typeOid(t)
          return OID.TEXT
        })
        sock.write(rowDescriptionTyped(cols, oids))
        break
      }
      case 'E': {
        // Execute：执行 portal 绑定的 statement（参数来自 Bind）——客户端 portal 通常空名
        const ePortal = cstrOf(msg.payload, 0)
        const portalTarget = this.portals.get(ePortal)
        let parse = getParse()
        if (!parse && portalTarget) parse = { name: ePortal, ...portalTarget }
        if (parse) {
          this.queryLog.push(parse.sql)
          const params = parse.bindParams ?? []
          setParse(null)
          setExec(this.executeSql(parse.sql, params).then((result) => {
            this.writeQueryResult(sock, result, parse.sql, getTx, setTx)
          }))
        } else {
          sock.write(errorResponse('26000', 'no prepared statement'))
        }
        break
      }
      case 'H': {
        // Flush：服务器无缓冲（每消息即发）——no-op（半双工协议允许）
        break
      }
      case 'S': {
        // Sync：ReadyForQuery（等 Execute 应答先回——半双工顺序：数据在就绪前）
        void (getExec() ?? Promise.resolve()).then(() => {
          sock.write(encodeMessage('Z', _encoder.encode(getTx() ? 'T' : 'I')))
        })
        break
      }
      case 'X': {
        // Terminate
        sock.end()
        break
      }
      default:
        sock.write(errorResponse('0A000', `memory-postgres: unsupported message type '${msg.type}'`))
    }
  }

  /** 执行 SQL（MemorySql 引擎——async 异常转 { error }） */
  private async executeSql(sql: string, params: unknown[]): Promise<unknown[] | { error: Error }> {
    try {
      // 表存在性检查（内存惰性建表 vs 真库 42P01——服务器需报错）
      const head = sql.trim().toUpperCase()
      const tbl = /^(?:SELECT\s+.*\s+FROM|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i.exec(sql)?.[1]
      if (tbl && !head.startsWith('BEGIN') && !this.engine.hasTable(tbl)) {
        const err = new ProtocolError(`relation "${tbl}" does not exist`)
        ;(err as Error & { code?: string }).code = '42P01'
        return { error: err }
      }
      const r = await this.engine.unsafe(sql, params)
      if (process.env.PGDBG) console.error('[pgdbg]', sql, 'params=' + JSON.stringify(params), 'res=' + JSON.stringify(r))
      return r
    } catch (err) {
      if (process.env.PGDBG) console.error('[pgdbg] ERR', sql, (err as Error).message)
      return { error: err as Error }
    }
  }

  /** 运行查询并编码应答 */
  private async runQuery(
    sock: Socket,
    sql: string,
    params: unknown[],
    getTx: () => boolean,
    setTx: (t: boolean) => void,
  ): Promise<void> {
    // 事务原语（BEGIN/COMMIT/ROLLBACK）——内存自动提交语义，但跟踪状态供 ReadyForQuery
    const head = sql.trim().toUpperCase()
    if (head === 'BEGIN') {
      setTx(true)
      this.txSnap = this.engine.snapshot() // 快照——ROLLBACK 恢复/COMMIT 丢弃
      sock.write(encodeMessage('C', cstr('BEGIN')))
      sock.write(encodeMessage('Z', _encoder.encode('T')))
      return
    }
    if (head === 'COMMIT' || head === 'ROLLBACK') {
      if (head === 'ROLLBACK' && this.txSnap) this.engine.restore(this.txSnap) // 回滚撤销事务内写入
      this.txSnap = null
      setTx(false)
      sock.write(encodeMessage('C', cstr(head === 'COMMIT' ? 'COMMIT' : 'ROLLBACK')))
      sock.write(encodeMessage('Z', _encoder.encode('I')))
      return
    }
    const result = await this.executeSql(sql, params)
    this.writeQueryResult(sock, result, sql, getTx, setTx)
  }

  private writeQueryResult(
    sock: Socket,
    result: { error?: Error } | unknown[],
    sql: string,
    getTx: () => boolean,
    setTx: (t: boolean) => void,
  ): void {
    if (result && typeof result === 'object' && !Array.isArray(result) && 'error' in result) {
      const err = (result as { error: Error & { code?: string } }).error
      sock.write(errorResponse(err.code ?? '42601', err.code ? err.message : `syntax error: ${err.message}`))
      sock.write(encodeMessage('Z', _encoder.encode(getTx() ? 'T' : 'I')))
      return
    }
    const rows = (result as unknown[]) ?? []
    const head = sql.trim().toUpperCase()
    const isSelect = /^SELECT/.test(head)
    const isReturning = /RETURNING/.test(sql)
    if (isSelect || isReturning) {
      // RowDescription：静态列名 + OID（cast 优先；无 cast 用值推断——常量 SELECT 1 → int）
      const cols = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : extractColumns(sql)
      const oids = cols.map((c) => {
        const cast = inferOidFromSql(sql, c)
        if (cast !== OID.TEXT) return cast
        // 表列类型（CREATE 记忆）——优先于值推断（jsonb 列存对象/字符串都标 jsonb）
        const tbl = /^SELECT\s+.*\s+FROM\s+(\w+)/i.exec(sql)?.[1]
        const t = tbl ? this.engine.getColumnType(tbl, c) : undefined
        if (t && t !== 'text' && t !== 'varchar') return typeOid(t)
        return rows.length ? inferOid(((rows[0] as Record<string, unknown>)[c] as unknown)) : OID.TEXT
      })
      sock.write(rowDescriptionTyped(cols, oids))
      for (const row of rows) sock.write(dataRow(row as Record<string, unknown>))
      sock.write(encodeMessage('C', cstr(isSelect ? 'SELECT ' + rows.length : 'INSERT 0 ' + rows.length)))
    } else if (/^(INSERT|UPDATE|DELETE)/.test(head)) {
      const affected = (result as { affectedRows?: number }).affectedRows ?? rows.length
      const tag = head.startsWith('INSERT') ? `INSERT 0 ${affected}` : head.startsWith('UPDATE') ? `UPDATE ${affected}` : `DELETE ${affected}`
      sock.write(encodeMessage('C', cstr(tag)))
    } else {
      sock.write(encodeMessage('C', cstr('OK')))
    }
    sock.write(encodeMessage('Z', _encoder.encode(getTx() ? 'T' : 'I')))
  }
}

// ── 协议帧编码工具 ───────────────────────────────────────

function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff])
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, n >>> 0)
  return out
}

/** 多段 Uint8Array 拼接（Uint8Array + 是字符串拼接陷阱） */
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

function cstr(s: string): Uint8Array {
  const body = _encoder.encode(s)
  const out = new Uint8Array(body.length + 1)
  out.set(body, 0)
  return out
}

function cstrOf(buf: Uint8Array, start: number): string {
  const end = buf.indexOf(0, start)
  return _decoder.decode(buf.subarray(start, end < 0 ? buf.length : end))
}

function errorResponse(code: string, message: string): Uint8Array {
  const fields = _encoder.encode(`SERROR\0C${code}\0M${message}\0`)
  return encodeMessage('E', fields)
}

/** RowDescription：显式列 + OID（Describe 用——静态 SQL 提取） */
function rowDescriptionTyped(cols: string[], oids: number[]): Uint8Array {
  const payload: Uint8Array[] = [u16(cols.length)]
  for (let i = 0; i < cols.length; i++) {
    const oid = oids[i] ?? OID.TEXT
    payload.push(cstr(cols[i]))
    payload.push(u32(0))
    payload.push(u16(i + 1))
    payload.push(u32(oid))
    payload.push(u16(typeLen(oid)))
    payload.push(u32(0xffffffff))
    payload.push(new Uint8Array([0, 0]))
  }
  const total = payload.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of payload) { out.set(p, off); off += p.length }
  return encodeMessage('T', out)
}

/** 参数描述（'t'）：count(2) + 每个参数 OID(4) */
function paramDescription(count: number, oids: number[]): Uint8Array {
  const payload: Uint8Array[] = [u16(count)]
  for (let i = 0; i < count; i++) payload.push(u32(oids[i] ?? OID.TEXT))
  const total = payload.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of payload) { out.set(p, off); off += p.length }
  return out
}

/** SQL 中 $n 参数个数（最大 n） */
function countParams(sql: string): number {
  let max = 0
  for (const m of sql.matchAll(/\$(\d+)/g)) {
    max = Math.max(max, Number(m[1]))
  }
  return max
}

/** 参数 OID：从 $n::type 推断（默认 text） */
function paramTypesFromSql(sql: string, count: number, engine?: MemorySql): number[] {
  const oids: number[] = []
  // INSERT INTO t VALUES ($1,$2)：$i 对表列序；无表场景（SELECT 常量）→ TEXT
  const insTable = /^INSERT\s+INTO\s+(\w+)/i.exec(sql)?.[1]
  for (let i = 1; i <= count; i++) {
    const m = new RegExp(`\\$${i}\\s*::\\s*(\\w+)`).exec(sql)
    if (m) { oids.push(typeOidFromName(m[1])); continue }
    // 无 cast：INSERT VALUES 按表列序 / SELECT WHERE col = $n → 列类型（int/bool/jsonb 参数转换）
    if (engine) {
      let colType: string | undefined
      if (insTable) {
        colType = engine.getColumnTypes(insTable)[i - 1]
      } else {
        const tbl = /^SELECT\s+.*\s+FROM\s+(\w+)/i.exec(sql)?.[1]
          ?? /^UPDATE\s+(\w+)/i.exec(sql)?.[1]
          ?? /^DELETE\s+FROM\s+(\w+)/i.exec(sql)?.[1]
        const col = new RegExp(`WHERE\\s+(\\w+)\\s*=\\s*\\$${i}\\b`, 'i').exec(sql)?.[1]
        if (tbl && col) colType = engine.getColumnType(tbl, col)
      }
      if (colType && !['text', 'varchar'].includes(colType)) { oids.push(typeOid(colType)); continue }
    }
    oids.push(OID.TEXT)
  }
  return oids
}

function typeOidFromName(t: string): number {
  switch (t.toLowerCase()) {
    case 'int': case 'int4': return OID.INT4
    case 'int8': case 'bigint': return OID.INT8
    case 'float': case 'float8': case 'numeric': return OID.FLOAT8
    case 'bool': case 'boolean': return OID.BOOL
    case 'jsonb': return OID.JSONB
    case 'uuid': return OID.UUID
    case 'timestamptz': return OID.TIMESTAMPTZ
    case 'timestamp': return OID.TIMESTAMP
    case 'date': return OID.DATE
    default: return OID.TEXT
  }
}

/** 静态提取 SELECT 投影列名（AS 别名优先，否则列名去表前缀） */
function extractColumns(sql: string): string[] {
  const m = /^SELECT\s+(.+?)\s+FROM/i.exec(sql.trim())
  const sel = m ? m[1] : /^SELECT\s+(.+)$/i.exec(sql.trim())?.[1]
  if (!sel) return []
  // 顶层逗号分割
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => {
    const t = p.trim()
    const as = /AS\s+(\w+)$/i.exec(t)
    if (as) return as[1]
    return t.replace(/^\w+\./, '').replace(/['"]/g, '')
  })
}

/** 从 SQL cast（::type）推断列 OID */
function inferOidFromSql(sql: string, col: string): number {
  // 找列对应的 ::type（简化：搜索整个 SQL 中的 ::type）
  const cast = /::(\w+)/gi.exec(sql)
  if (cast) {
    const t = cast[1].toLowerCase()
    switch (t) {
      case 'int': case 'int4': return OID.INT4
      case 'int8': case 'bigint': return OID.INT8
      case 'float': case 'float8': case 'numeric': return OID.FLOAT8
      case 'bool': case 'boolean': return OID.BOOL
      case 'jsonb': return OID.JSONB
      case 'uuid': return OID.UUID
      case 'timestamptz': return OID.TIMESTAMPTZ
      case 'timestamp': return OID.TIMESTAMP
      case 'date': return OID.DATE
    }
  }
  return OID.TEXT
}

/** DataRow：每列长度 + 字节（NULL = -1） */
function dataRow(row: Record<string, unknown>): Uint8Array {
  const cols = Object.keys(row)
  const payload: Uint8Array[] = [u16(cols.length)]
  for (const c of cols) {
    const v = row[c]
    if (v === null || v === undefined) {
      payload.push(u32(0xffffffff))
      continue
    }
    const text = typeof v === 'boolean' ? (v ? 't' : 'f') : typeof v === 'object' ? JSON.stringify(v) : String(v)
    const body = _encoder.encode(text)
    payload.push(u32(body.length))
    payload.push(body)
  }
  const total = payload.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of payload) { out.set(p, off); off += p.length }
  return encodeMessage('D', out)
}

function typeLen(oid: number): number {
  switch (oid) {
    case OID.INT8: case OID.FLOAT8: return 8
    case OID.INT4: case OID.TIMESTAMPTZ: case OID.TIMESTAMP: return 4
    case OID.BOOL: return 1
    case OID.UUID: return 16
    default: return -1 // varlena
  }
}
