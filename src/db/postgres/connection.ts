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

export interface PgConnectionOptions {
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  /** 连接超时 ms。默认 10_000。 */
  connectTimeoutMs?: number
  /** SSL 模式（暂不支持） */
}

export interface Row {
  [col: string]: unknown
}

export class PgConnection {
  private opts: Required<Pick<PgConnectionOptions, 'host' | 'port' | 'user' | 'database' | 'connectTimeoutMs'>> & {
    password?: string
  }
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
      password: options.password,
    }
  }

  get connected(): boolean {
    return this.status === 'ready'
  }

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
        sock.write(
          Buffer.from(
            startupMessage({ user: this.opts.user, database: this.opts.database }),
          ),
        )
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
  private authStage: 'start' | 'sasl-initial' | 'sasl-final' = 'start'
  private authCtx: { clientNonce: string; clientFirstBare: string; serverFirst: string } | null = null
  private currentQuery: {
    columns: ReturnType<typeof parseRowDescription>
    rows: Row[]
    resolve: (rows: Row[]) => void
    reject: (e: unknown) => void
    sql?: string
    params?: (string | null)[]
    awaitingDescribe?: boolean
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
          this.authStage = 'sasl-initial'
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
          this.authStage = 'sasl-final'
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
        // ReadyForQuery——连接就绪
        this.expectingAuth = false
        this.onReady?.()
        return
      }
      // 参数状态等忽略
      return
    }

    // 查询阶段
    switch (msg.type) {
      case 'T': {
        if (this.currentQuery) this.currentQuery.columns = parseRowDescription(msg.payload)
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
      case 'C':
        break // CommandComplete——忽略 tag
      case 't': {
        // ParameterDescription——收到后发 Bind + Execute + Sync（扩展查询流程）
        if (this.currentQuery?.awaitingDescribe && this.currentQuery.sql !== undefined) {
          this.currentQuery.awaitingDescribe = false
          this.send(bindMessage('', this.currentQuery.params ?? []))
          this.send(executeMessage())
          this.send(syncMessage())
        }
        break
      }
      case 'Z': {
        const q = this.currentQuery
        this.currentQuery = null
        if (q) q.resolve(q.rows)
        this.notifyIdle()
        break
      }
      case 'E': {
        const fields = parseErrorFields(msg.payload)
        const q = this.currentQuery
        this.currentQuery = null
        if (q) {
          const err = new Error(fields.message ?? 'postgres query error') as Error & { code?: string }
          err.code = fields.code
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

  /** 事务：BEGIN → fn(tx) → COMMIT；fn 抛错 → ROLLBACK（回滚失败吞掉，保留原始错误） */
  async transaction<T>(
    fn: (tx: { query: (sql: string, params?: (string | number | boolean | object | null)[]) => Promise<Row[]> }) => Promise<T>,
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
  query(sql: string, params?: (string | number | boolean | object | null)[]): Promise<Row[]> {
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
        this.socket.write(Buffer.from(queryMessage(sql)))
      } else {
        // 扩展查询：Parse → (服务器回 ParameterDescription) → Bind + Execute + Sync
        this.currentQuery = {
          columns: [],
          rows: [],
          resolve,
          reject,
          sql,
          params: encodeParams(params),
          awaitingDescribe: true,
        }
        // Parse + Describe + Flush：服务器回 ParseComplete(1) + ParameterDescription(t)
        this.socket.write(Buffer.from(parseMessage('', sql, params.map(() => 0))))
        this.socket.write(Buffer.from(describeMessage('S', '')))
        this.socket.write(Buffer.from(flushMessage()))
      }
    })
  }

  private send(data: Uint8Array) {
    this.socket?.write(Buffer.from(data))
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
      sock.write(Buffer.from(terminateMessage()))
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

/** 参数编码：null 保留，object → JSON 字符串（jsonb），其余 → String */
function encodeParams(
  params: (string | number | boolean | object | null)[],
): (string | null)[] {
  return params.map((p) => {
    if (p === null || p === undefined) return null
    if (typeof p === 'object') return JSON.stringify(p)
    return String(p)
  })
}

/** 按列类型 OID 将文本值转换为 JS 类型（类型映射层） */
function convertValue(oid: number, value: string | null): unknown {
  if (value === null) return null
  switch (oid) {
    case 114:
    case 3802:
      // json / jsonb——自动 JSON.parse（消灭业务 parseRow 样板）
      return JSON.parse(value)
    case 20:
    case 21:
    case 23:
    case 26:
      // int8 / int2 / int4 / int8
      return Number(value)
    case 700:
    case 701:
    case 1700:
      // float4 / float8 / numeric
      return parseFloat(value)
    case 16:
      // boolean
      return value === 't'
    default:
      // text / varchar / uuid / date / timestamp 等保持字符串
      return value
  }
}
