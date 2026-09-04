/**
 * weifuwu/db/postgres — PostgreSQL 连接（v3 协议）
 *
 * 连接流程: startup → 认证（SCRAM-SHA-256 / md5 / cleartext）→ 参数/就绪
 * 查询流程: Query(Q) → RowDescription/DataRow/CommandComplete → ReadyForQuery
 *
 * 认证支持:
 *   R=0    OK
 *   R=3    cleartext
 *   R=5    md5
 *   R=10/11/12  SCRAM-SHA-256（PG15+ 默认）
 */

import net from 'node:net'
import type { Socket } from 'node:net'
import crypto from 'node:crypto'
import type { PostgresPoolConnection, Row, QueryResult } from '../contracts.ts'
import {
  startupMessage,
  queryMessage,
  parseMessage,
  bindMessage,
  executeMessage,
  syncMessage,
  flushMessage,
  describeMessage,
  passwordMessage,
  terminateMessage,
  MessageStream,
  authCode,
  parseRowDescription,
  parseDataRow,
  readyStatus,
  parseErrorFields,
  type Message,
} from './protocol.ts'
import { ConnectionError } from '../errors.ts'

/**
 * DDL 失效错误检测（seed/迁移 DROP 表/类型后，服务器缓存语句引用已删 OID）：
 *   - cached plan must not change result type  — 结果行类型因 DROP+CREATE 改变
 *   - cache lookup failed for type NNNN        — 结果类型引用已 DROP 的 enum/类型
 * 命中 → 清客户端语句缓存 + Sync 复位后重 Parse（新语句名 = 按当前 schema 重新解析）。
 */
function isCacheInvalidationError(message: string): boolean {
  return (
    message.includes('cached plan must not change result type') ||
    message.includes('cache lookup failed for type')
  )
}

export interface PgConnectionOptions {
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  /** 连接超时 ms。默认 10_000。 */
  connectTimeoutMs?: number
  /** 语句超时 ms（慢查询保护，会话级 SET statement_timeout）。默认 0 = 禁用。 */
  statementTimeoutMs?: number
  /** SSL 模式（暂不支持） */
}

export class PgConnection implements PostgresPoolConnection {
  private opts: Required<
    Pick<PgConnectionOptions, 'host' | 'port' | 'user' | 'database' | 'connectTimeoutMs' | 'statementTimeoutMs'>
  > & {
    password?: string
  }
  private timeoutSet = false
  private awaitingReady = false
  private pendingErrorZ = false
  private socket: Socket | null = null
  private stream = new MessageStream()
  private status: 'idle' | 'connecting' | 'ready' | 'closed' = 'idle'
  private waiters: (() => void)[] = []

  constructor(options: PgConnectionOptions = {}) {
    this.opts = {
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 5432,
      user: options.user ?? 'postgres',
      database: options.database ?? 'postgres',
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      statementTimeoutMs: options.statementTimeoutMs ?? 0,
      password: options.password,
    }
  }

  get connected(): boolean {
    return this.status === 'ready'
  }

  /** 池空闲回收用：最近一次查询完成时间戳（pool release 时更新） */
  lastUsed = 0

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.status = 'connecting'
      const sock = net.connect(this.opts.port, this.opts.host)
      this.socket = sock

      const timeout = setTimeout(() => {
        sock.destroy()
        reject(new ConnectionError(`postgres: connect timeout after ${this.opts.connectTimeoutMs}ms`))
      }, this.opts.connectTimeoutMs)

      sock.once('connect', () => {
        sock.setNoDelay(true) // 禁用 Nagle——避免 loopback delayed-ACK 40ms 惩罚
        sock.write(startupMessage({ user: this.opts.user, database: this.opts.database }))
      })

      sock.on('data', (chunk: Buffer) => this.onData(chunk))

      sock.on('error', (err) => {
        clearTimeout(timeout)
        if (this.status === 'connecting') {
          reject(new ConnectionError(`postgres: ${err.message}`))
        }
      })

      sock.on('close', () => {
        clearTimeout(timeout)
        this.socket = null
        if (this.status !== 'closed') {
          this.status = 'closed'
          // 进行中的查询永远等不到响应——reject（连接已死），而非挂起
          const q = this.currentQuery
          this.currentQuery = null
          if (q) q.reject(new ConnectionError('postgres: connection closed'))
        }
      })

      this.onReady = () => {
        clearTimeout(timeout)
        this.status = 'ready'
        resolve()
      }
      this.onAuthFail = (err) => {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  private onReady: (() => void) | null = null
  private onAuthFail: ((err: unknown) => void) | null = null
  private expectingAuth = true
  private authCtx: { clientNonce: string; clientFirstBare: string; serverFirst: string } | null = null
  private prepared = new Map<string, { name: string; columns: ReturnType<typeof parseRowDescription> }>() // sig → stmt + 列缓存（LRU）
  private static readonly PREPARED_MAX = 128
  private stmtSeq = 0
  /** LRU 淘汰的 statement 名——连接空闲时批量 DEALLOCATE（服务端同步释放，防 plan 缓存膨胀） */
  private deallocQueue: string[] = []
  /** DEALLOCATE 批量的响应 Z——仅消费（不 resolve 查询） */
  private awaitingDeallocZ = false
  private currentQuery: {
    columns: ReturnType<typeof parseRowDescription>
    rows: Row[]
    resolve: (rows: QueryResult<Row>) => void
    reject: (e: unknown) => void
    sql?: string
    params?: (string | null)[]
    awaitingDescribe?: boolean
    prepKey?: string
    prepName?: string
    retried?: boolean
    affectedRows?: number
  } | null = null

  /** DDL 失效重试：缓存语句被 DROP 后服务器拒绝执行，Sync 复位后以新语句名重 Parse */
  private pendingRetry: {
    sql: string
    params?: (string | null)[]
    columns: ReturnType<typeof parseRowDescription>
    resolve: (rows: Row[]) => void
    reject: (e: unknown) => void
    retried: boolean
  } | null = null

  private onData(chunk: Buffer) {
    const msgs = this.stream.push(new Uint8Array(chunk))
    for (const msg of msgs) {
      this.handle(msg)
    }
  }

  private handle(msg: Message) {
    // 认证阶段
    if (this.expectingAuth) {
      if (msg.type === 'R') {
        const code = authCode(msg)
        if (code === 0) {
          // 认证完成——等待后续参数/就绪
        } else if (code === 3) {
          // cleartext
          this.send(passwordMessage(this.opts.password ?? ''))
        } else if (code === 5) {
          // md5: md5(md5(password + user) + salt)
          const salt = msg.payload.subarray(8, 12)
          const inner = crypto
            .createHash('md5')
            .update(this.opts.password + this.opts.user)
            .digest('hex')
          const outer = crypto
            .createHash('md5')
            .update(inner + Buffer.from(salt).toString('latin1'))
            .digest('hex')
          this.send(passwordMessage(`md5${outer}`))
        } else if (code === 10) {
          // SASL——发初始响应（机制名\0 + 响应长度(4) + client-first）
          const nonce = crypto.randomBytes(18).toString('base64url')
          const clientFirstBare = `n=,r=${nonce}`
          this.authCtx = { clientNonce: nonce, clientFirstBare, serverFirst: '' }
          const mech = utf8('SCRAM-SHA-256\0')
          // gs2 header 'n,,' + client-first-bare（AuthMessage 计算用 bare）
          const resp = utf8(`n,,${clientFirstBare}`)
          const payload = new Uint8Array(mech.length + 4 + resp.length)
          payload.set(mech, 0)
          payload[mech.length] = (resp.length >> 24) & 0xff
          payload[mech.length + 1] = (resp.length >> 16) & 0xff
          payload[mech.length + 2] = (resp.length >> 8) & 0xff
          payload[mech.length + 3] = resp.length & 0xff
          payload.set(resp, mech.length + 4)
          this.send(encodeP(payload))
        } else if (code === 11) {
          // SASLContinue——处理 server-first，发 final
          const serverFirst = new TextDecoder().decode(msg.payload.subarray(4))
          if (!this.authCtx) {
            this.onAuthFail?.(new ConnectionError('postgres: unexpected SASL continue'))
            return
          }
          this.authCtx.serverFirst = serverFirst
          const clientFinal = this.scramFinal(this.authCtx)
          this.send(encodeP(utf8(clientFinal)))
        } else if (code === 12) {
          // SASLFinal——验证 server signature
          const serverFinal = new TextDecoder().decode(msg.payload.subarray(4))
          const vMatch = serverFinal.match(/v=([A-Za-z0-9+/=]+)/)
          if (vMatch && this.authCtx) {
            const expected = this.scramServerSignature(this.authCtx)
            if (vMatch[1] !== expected) {
              this.onAuthFail?.(new ConnectionError('postgres: SCRAM server signature mismatch'))
              return
            }
          }
        }
        return
      }
      if (msg.type === 'E') {
        const fields = parseErrorFields(msg.payload)
        this.expectingAuth = false
        this.onAuthFail?.(new ConnectionError(`postgres: auth failed: ${fields.message ?? 'unknown'}`))
        this.socket?.destroy()
        return
      }
      if (msg.type === 'Z') {
        this.expectingAuth = false
        // statement_timeout：认证后设置会话级超时（慢查询保护），等其完成再 ready
        if (this.opts.statementTimeoutMs > 0 && !this.timeoutSet) {
          this.timeoutSet = true
          this.awaitingReady = true
          this.socket?.write(queryMessage(`SET statement_timeout = ${this.opts.statementTimeoutMs}`))
          return
        }
        this.onReady?.()
        return
      }
      // 参数状态等忽略
      return
    }

    // 查询阶段
    switch (msg.type) {
      case 'T': {
        if (this.currentQuery) {
          this.currentQuery.columns = parseRowDescription(msg.payload)
          // prepare 首次：缓存列信息供后续复用（Describe 只回一次 T）
          const sig = `${this.currentQuery.sql}|${this.currentQuery.params?.length ?? 0}`
          const entry = this.getPrepared(sig)
          if (entry) entry.columns = this.currentQuery.columns
        }
        break
      }
      case 'D': {
        const values = parseDataRow(msg.payload)
        if (this.currentQuery && this.currentQuery.columns) {
          const row: Row = {}
          this.currentQuery.columns.forEach((col, i) => {
            row[col.name] = convertValue(col.typeOid, values[i] ?? null)
          })
          this.currentQuery.rows.push(row)
        }
        break
      }
      case 'C': {
        // CommandComplete——解析影响行数（INSERT 0 N / UPDATE N / DELETE N / MERGE N）
        const q = this.currentQuery
        if (q) {
          // Uint8Array 无编码 toString——必须 TextDecoder
          const tag = new TextDecoder().decode(msg.payload).replace(/\0+$/, '')
          const m = tag.match(/^(?:INSERT|UPDATE|DELETE|MERGE)\s+(?:\d+\s+)?(\d+)$/)
          if (m) q.affectedRows = parseInt(m[1], 10)
        }
        break
      }
      case 't': {
        // ParameterDescription——Parse 成功确认，缓存 statement 后发 Bind + Execute + Sync
        if (this.currentQuery?.awaitingDescribe && this.currentQuery.sql !== undefined) {
          this.currentQuery.awaitingDescribe = false
          // 仅在 Parse 成功后缓存（错误 Parse 不污染缓存——下次可重新准备）
          if (this.currentQuery.prepKey && this.currentQuery.prepName) {
            this.setPrepared(this.currentQuery.prepKey, {
              name: this.currentQuery.prepName,
              columns: this.currentQuery.columns,
            })
          }
          this.send(bindMessage(this.currentQuery.prepName ?? '', this.currentQuery.params ?? []))
          this.send(executeMessage())
          this.send(syncMessage())
        }
        break
      }
      case 'Z': {
        // 错误后的复位 Z：仅消费（不 resolve 任何查询）
        if (this.pendingErrorZ) {
          this.pendingErrorZ = false
          // DDL 失效恢复：连接复位后以新语句名重 Parse（服务器按当前 schema 重新解析）
          if (this.pendingRetry) {
            const r = this.pendingRetry
            this.pendingRetry = null
            this.issueExtendedQuery(r.sql, r.params ?? [], r.resolve, r.reject, r.retried)
          }
          break
        }
        // DEALLOCATE 批量的响应 Z——仅消费（不触达查询；其后的查询 Z 正常处理）
        if (this.awaitingDeallocZ) {
          this.awaitingDeallocZ = false
          break
        }
        const q = this.currentQuery
        this.currentQuery = null
        if (q) {
          const rows = q.rows as QueryResult<Row>
          // 非枚举属性：行数据语义不变（deepEqual/JSON.stringify 不受影响）
          if (q.affectedRows !== undefined) {
            Object.defineProperty(rows, 'affectedRows', {
              value: q.affectedRows,
              enumerable: false,
              writable: true,
              configurable: true,
            })
          }
          q.resolve(rows)
        }
        // 连接空闲：批量释放 LRU 淘汰的 statement（写在前，后续查询一定在其后发出）
        this.flushDealloc()
        // statement_timeout 设置完成——连接真正就绪
        if (this.awaitingReady) {
          this.awaitingReady = false
          this.onReady?.()
        }
        this.notifyIdle()
        break
      }
      case 'E': {
        const fields = parseErrorFields(msg.payload)
        const q = this.currentQuery
        this.currentQuery = null
        if (q) {
          // 错误后：连接等待 Sync 的 ReadyForQuery 复位——下一个 Z 仅消费，不 resolve
          this.pendingErrorZ = true
          const err = new Error(fields.message ?? 'postgres query error') as Error & { code?: string }
          err.code = fields.code
          // ── DDL 失效恢复（seed/迁移 DROP 表/类型后，服务器缓存语句引用已删 OID）──
          // cached plan must not change result type / cache lookup failed for type：
          // 清空客户端语句缓存 + 保留 Promise，Sync 复位后重 Parse（新语句名 → 新 schema）
          if (q.prepKey && isCacheInvalidationError(fields.message ?? '')) {
            this.prepared.clear()
            if (!q.retried) {
              this.pendingRetry = {
                sql: q.sql ?? '',
                params: q.params,
                columns: q.columns,
                resolve: q.resolve,
                reject: q.reject,
                retried: true,
              }
              // 首次准备路径（Parse+Describe+Flush，无 Sync）需发 Sync 复位
              if (q.awaitingDescribe) this.send(syncMessage())
              break // 不 reject——Z 后重试
            }
          }
          // prepare 阶段错误：发 Sync 复位连接（PG 错误后需 Sync 恢复，否则后续查询被忽略）
          if (q.awaitingDescribe) this.send(syncMessage())
          q.reject(err)
        }
        break
      }
      case 'N':
        break // NoticeResponse 忽略
      default:
        break
    }
  }

  /** SCRAM client-final 消息 */
  private scramFinal(ctx: { clientNonce: string; clientFirstBare: string; serverFirst: string }): string {
    const parts = new Map(
      ctx.serverFirst.split(',').map((kv) => {
        const i = kv.indexOf('=')
        return [kv.slice(0, i), kv.slice(i + 1)]
      }),
    )
    const salt = Buffer.from(parts.get('s') ?? '', 'base64')
    const iterations = parseInt(parts.get('i') ?? '4096', 10)
    const nonce = parts.get('r') ?? ''
    const password = this.opts.password ?? ''

    const saltedPassword = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    const clientKey = hmac(saltedPassword, 'Client Key')
    const storedKey = crypto.createHash('sha256').update(clientKey).digest()
    const channelBinding = 'c=biws' // n,, 无通道绑定
    const clientFinalWithoutProof = `${channelBinding},r=${nonce}`
    const authMessage = `${ctx.clientFirstBare},${ctx.serverFirst},${clientFinalWithoutProof}`
    const clientSignature = hmac(storedKey, authMessage)
    const clientProof = xor(clientKey, clientSignature)
    return `${clientFinalWithoutProof},p=${Buffer.from(clientProof).toString('base64')}`
  }

  private scramServerSignature(ctx: { clientFirstBare: string; serverFirst: string }): string {
    const parts = new Map(
      ctx.serverFirst.split(',').map((kv) => {
        const i = kv.indexOf('=')
        return [kv.slice(0, i), kv.slice(i + 1)]
      }),
    )
    const salt = Buffer.from(parts.get('s') ?? '', 'base64')
    const iterations = parseInt(parts.get('i') ?? '4096', 10)
    const nonce = parts.get('r') ?? ''
    const saltedPassword = crypto.pbkdf2Sync(this.opts.password ?? '', salt, iterations, 32, 'sha256')
    const serverKey = hmac(saltedPassword, 'Server Key')
    const clientFinalWithoutProof = `c=biws,r=${nonce}`
    const authMessage = `${ctx.clientFirstBare},${ctx.serverFirst},${clientFinalWithoutProof}`
    return Buffer.from(hmac(serverKey, authMessage)).toString('base64')
  }

  /** LRU 读取：命中移到尾部（最近使用），超限删最旧 */
  private getPrepared(sig: string) {
    const entry = this.prepared.get(sig)
    if (entry) {
      this.prepared.delete(sig)
      this.prepared.set(sig, entry)
    }
    return entry
  }

  /** LRU 写入：刷新位置；超上限淘汰最旧（长运行服务防无限累积）——淘汰的 statement 推入 deallocQueue，连接空闲时服务端同步释放 */
  private setPrepared(sig: string, entry: { name: string; columns: ReturnType<typeof parseRowDescription> }) {
    this.prepared.delete(sig)
    this.prepared.set(sig, entry)
    if (this.prepared.size > PgConnection.PREPARED_MAX) {
      const oldest = this.prepared.keys().next().value
      if (oldest !== undefined) {
        const evicted = this.prepared.get(oldest)
        this.prepared.delete(oldest)
        if (evicted) this.deallocQueue.push(evicted.name)
      }
    }
  }

  /** 连接空闲时批量 DEALLOCATE：LRU 淘汰的 statement 不残留服务端（plan 缓存膨胀防线）。
   * 同步 write 先于后续查询（调用点在 Z handler 的同步段内，resolve 的微任务后至）。
   * 其响应 C+Z 在无 currentQuery 时到达——awaitingDeallocZ 消费首个 Z，后续查询 Z 正常。 */
  private flushDealloc(): void {
    if (this.deallocQueue.length === 0 || !this.socket) return
    const names = this.deallocQueue.splice(0)
    this.awaitingDeallocZ = true
    this.socket.write(queryMessage(names.map((n) => `DEALLOCATE "${n}"`).join('; ')))
  }

  /** 事务：BEGIN → fn(tx) → COMMIT；fn 抛错 → ROLLBACK（回滚失败吞掉，保留原始错误） */
  async transaction<T>(
    fn: (tx: { query: (sql: string, params?: (string | number | boolean | object | null)[]) => Promise<QueryResult<Row>> }) => Promise<T>,
  ): Promise<T> {
    await this.query('BEGIN')
    try {
      const result = await fn({ query: (sql, params) => this.query(sql, params) })
      await this.query('COMMIT')
      return result
    } catch (e) {
      await this.query('ROLLBACK').catch(() => {})
      throw e
    }
  }

  /** 查询：无参数走简单协议（Q），有参数走扩展查询（Parse/Bind/Execute/Sync） */
  query(sql: string, params?: (string | number | boolean | object | null)[]): Promise<QueryResult<Row>> {
    return new Promise((resolve, reject) => {
      if (this.status !== 'ready' || !this.socket) {
        reject(new ConnectionError('postgres: not connected'))
        return
      }
      if (this.currentQuery) {
        reject(new ConnectionError('postgres: query already in progress'))
        return
      }
      if (!params || params.length === 0) {
        // 简单查询（Q）
        this.currentQuery = {
          columns: [],
          rows: [],
          resolve,
          reject,
        }
        if (process.env.PGDBG2) console.error('[cquery]', JSON.stringify(sql.slice(0, 120)))
        this.socket.write(queryMessage(sql))
      } else {
        // 扩展查询：预处理语句缓存（首次 Parse+Describe，后续直接 Bind+Execute）
        const sig = `${sql}|${params.length}`
        let stmtEntry = this.getPrepared(sig)
        const encoded = encodeParams(params)
        if (!stmtEntry) {
          this.issueExtendedQuery(sql, encoded, resolve, reject)
        } else {
          // 已备 statement：直接 Bind(命名) + Execute + Sync——无 T（Describe 只回一次）
          this.currentQuery = {
            columns: [...stmtEntry.columns],
            rows: [],
            resolve,
            reject,
            sql,
            params: encoded,
            awaitingDescribe: false,
            prepKey: sig,
            prepName: stmtEntry.name,
          }
          this.socket.write(bindMessage(stmtEntry.name, encoded))
          this.socket.write(executeMessage())
          this.socket.write(syncMessage())
        }
      }
    })
  }

  /**
   * 扩展查询首次准备：Parse + Describe + Flush（无 Sync——错误时由调用方发 Sync 复位）。
   * retry 路径复用：新语句名强制服务器按当前 schema 重新解析（DDL 失效恢复）。
   */
  private issueExtendedQuery(
    sql: string,
    params: (string | null)[],
    resolve: (rows: Row[]) => void,
    reject: (e: unknown) => void,
    retried?: boolean,
  ): void {
    const name = `wf_s${++this.stmtSeq}`
    this.currentQuery = {
      columns: [],
      rows: [],
      resolve,
      reject,
      sql,
      params,
      awaitingDescribe: true,
      prepKey: `${sql}|${params.length}`,
      prepName: name,
      retried,
    }
    this.socket?.write(parseMessage(name, sql, params.map(() => 0)))
    this.socket?.write(describeMessage('S', name))
    this.socket?.write(flushMessage())
  }

  private send(data: Uint8Array) {
    this.socket?.write(data)
  }

  private notifyIdle() {
    const ws = this.waiters
    this.waiters = []
    for (const w of ws) w()
  }

  /** 等待连接空闲（事务/多语句流程用） */
  waitIdle(): Promise<void> {
    if (!this.currentQuery) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  /** 终止连接 */
  async close(): Promise<void> {
    const sock = this.socket
    if (this.status === 'ready' && sock) {
      sock.write(terminateMessage())
    }
    this.status = 'closed'
    if (sock) sock.destroy()
  }
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

/** SASL 响应消息（p 类型，payload 前 4 字节为长度） */
function encodeP(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 4 + payload.length)
  out[0] = 0x70 // 'p'
  const len = 4 + payload.length
  out[1] = (len >> 24) & 0xff
  out[2] = (len >> 16) & 0xff
  out[3] = (len >> 8) & 0xff
  out[4] = len & 0xff
  out.set(payload, 5)
  return out
}

function hmac(key: Uint8Array, data: string): Uint8Array {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i]
  return out
}

/** 参数编码：null 保留，__pgArray 标记 → PG 数组字面量，object → JSON 字符串（jsonb），其余 → String */
function encodeParams(
  params: (string | number | boolean | object | null)[],
): (string | null)[] {
  return params.map((p) => {
    if (p === null || p === undefined) return null
    if (typeof p === 'object') {
      // sql.array() 标记 → PG 数组字面量（ANY($n::uuid[]) 等——类型不可知困境的显式出路：
      // 数组默认 JSON 是 jsonb 列语义，PG 数组语义需显式标记——两义并存零破坏）
      if (Array.isArray((p as { __pgArray?: unknown }).__pgArray)) {
        return toPgArrayLiteral((p as { __pgArray: unknown[] }).__pgArray)
      }
      return JSON.stringify(p)
    }
    return String(p)
  })
}

/** JS 数组 → PG 数组字面量（{a,b} 格式）：
 *  - null/undefined 元素 → NULL（无引号）
 *  - 含 " , { } \\ 的元素双引号包裹 + \\ 转义（PG 数组文本格式）
 *  - 数字/布尔按 String 编码（int[]/bool[] 由调用方 cast 定型）
 *  - 空数组 → {}（配合 ::uuid[] cast 即空集语义） */
export function toPgArrayLiteral(values: unknown[]): string {
  const items = values.map((v) => {
    if (v === null || v === undefined) return 'NULL'
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/^[A-Za-z0-9_+.-]*$/.test(s)) return s // uuid/数字/简单标识——裸写
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  })
  return `{${items.join(',')}}`
}

/** 按列类型 OID 将文本值转换为 JS 类型（类型映射层） */
function convertValue(oid: number, value: string | null): unknown {
  if (value === null) return null
  switch (oid) {
    case 114:
    case 3802:
      // json / jsonb——自动 JSON.parse（消灭业务 parseRow 样板）
      return JSON.parse(value)
    case 20: {
      // int8——超安全整数范围返回 string（防静默精度丢失，金额/ID 场景关键）
      const n = BigInt(value)
      if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(-Number.MAX_SAFE_INTEGER)) {
        return value
      }
      return Number(n)
    }
    case 21:
    case 23:
    case 26:
      // int2 / int4 / int8
      return Number(value)
    case 700:
    case 701:
    case 1700:
      // float4 / float8 / numeric
      return parseFloat(value)
    case 16:
      // boolean
      return value === 't'
    case 1184:
      // timestamptz——带时区（ISO +00），new Date 语义安全（无本地时区魔法）
      // 裁剪边界：timestamp(1114)/date(1082)/interval(1186) 保持字符串——
      // 无时区类型转 Date 按本地时区解析本身就是时区魔法，明确不转
      return new Date(value)
    default:
      // text / varchar / uuid / timestamp / date 等保持字符串
      return value
  }
}

// 契约兼容 re-export（旧 import { Row } from connection.ts 继续可用）
export type { Row, QueryResult } from '../contracts.ts'
