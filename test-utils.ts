/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context, Handler } from './types.ts'
import type { SqlClient } from './vendor.ts'
import { Router } from './router.ts'
import { serve } from './serve.ts'
import { WebSocket as WSWebSocket } from 'ws'

export interface TestResponse {
  readonly status: number
  readonly headers: Headers
  json<T = unknown>(): Promise<T>
  text(): Promise<string>
}

class TestResponseImpl implements TestResponse {
  private response: Response
  constructor(response: Response) {
    this.response = response
  }

  get status(): number {
    return this.response.status
  }

  get headers(): Headers {
    return this.response.headers
  }

  async json<T = unknown>(): Promise<T> {
    return this.response.json() as T
  }

  async text(): Promise<string> {
    return this.response.text()
  }

  async bytes(): Promise<Uint8Array> {
    return this.response.bytes()
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer()
  }
}

export class TestRequest {
  private headers: Record<string, string> = {}
  private ctxMixin: Partial<Context> = {}
  private bodyData: BodyInit | null = null
  private app: TestApp
  private method: string
  private path: string

  constructor(app: TestApp, method: string, path: string) {
    this.app = app
    this.method = method
    this.path = path
  }

  /** Set a request header */
  header(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value
    return this
  }

  /** Mix properties into ctx (simulating middleware injection) */
  with(mixin: Partial<Context>): this {
    Object.assign(this.ctxMixin, mixin)
    return this
  }

  /** Shortcut: set ctx.user */
  withUser(user: unknown): this {
    ;(this.ctxMixin as Record<string, unknown>).user = user
    return this
  }

  /** Shortcut: set ctx.tenant */
  withTenant(tenant: { id: string; name: string; role: string }): this {
    this.ctxMixin.tenant = tenant as any
    return this
  }

  /** Set JSON request body */
  body(data: unknown): this {
    this.bodyData = JSON.stringify(data)
    this.headers['content-type'] = 'application/json'
    return this
  }

  /** Set raw text body */
  rawBody(data: string): this {
    this.bodyData = data
    return this
  }

  /** Send the request and return the response */
  async send(): Promise<TestResponse> {
    const url = `http://localhost${this.path}`

    // Parse query params from the path
    const query: Record<string, string> = {}
    const qIdx = this.path.indexOf('?')
    if (qIdx !== -1) {
      const searchParams = new URLSearchParams(this.path.slice(qIdx))
      for (const [k, v] of searchParams) {
        query[k] = v
      }
    }

    const request = new Request(url, {
      method: this.method,
      headers: this.headers,
      body: this.bodyData,
    })

    const ctx: Context = {
      params: {},
      query,
      ...this.ctxMixin,
    } as Context

    const handler: Handler = this.app.handler()
    const response = await handler(request, ctx)
    return new TestResponseImpl(response)
  }
}

export class TestApp {
  private router: Router
  private wsServer: Awaited<ReturnType<typeof serve>> | null = null
  private wsConnections: TestWSConnection[] = []

  constructor() {
    this.router = new Router()
  }

  /**
   * Register a WebSocket handler.
   */
  ws(path: string, handler: import('./router.ts').WebSocketHandler): this {
    this.router.ws(path, handler)
    return this
  }

  /** Get the raw Router (for advanced use). */
  get _router(): Router {
    return this.router
  }

  /** Add global middleware */
  use(mw: any): this {
    this.router.use(mw)
    return this
  }

  /** Register a GET route — supports route-level middleware via spread args. */
  get(path: string, ...args: any[]): this {
    ;(this.router.get as any)(path, ...args)
    return this
  }

  /** Register a POST route. */
  post(path: string, ...args: any[]): this {
    ;(this.router.post as any)(path, ...args)
    return this
  }

  /** Register a PUT route. */
  put(path: string, ...args: any[]): this {
    ;(this.router.put as any)(path, ...args)
    return this
  }

  /** Register a PATCH route. */
  patch(path: string, ...args: any[]): this {
    ;(this.router.patch as any)(path, ...args)
    return this
  }

  /** Register a DELETE route. */
  delete(path: string, ...args: any[]): this {
    ;(this.router.delete as any)(path, ...args)
    return this
  }

  /** Start building a GET request */
  getReq(path: string): TestRequest {
    return new TestRequest(this, 'GET', path)
  }

  /** Start building a POST request */
  postReq(path: string): TestRequest {
    return new TestRequest(this, 'POST', path)
  }

  /** Start building a PUT request */
  putReq(path: string): TestRequest {
    return new TestRequest(this, 'PUT', path)
  }

  /** Start building a PATCH request */
  patchReq(path: string): TestRequest {
    return new TestRequest(this, 'PATCH', path)
  }

  /** Start building a DELETE request */
  deleteReq(path: string): TestRequest {
    return new TestRequest(this, 'DELETE', path)
  }

  /** Get the underlying handler (for advanced usage) */
  handler(): Handler {
    return this.router.handler()
  }

  /** Start building a WebSocket connection to the given path. */
  wsReq(path: string): TestWSRequest {
    return new TestWSRequest(this, path)
  }

  /**
   * Internal: ensure HTTP server is running for WebSocket connections.
   * Starts on a random port.
   */
  /* @internal */ async _ensureServer(): Promise<string> {
    if (this.wsServer) {
      return `http://localhost:${this.wsServer.port}`
    }
    const wsHandler = this.router.websocketHandler()
    if (!wsHandler) {
      throw new Error(
        'No WebSocket routes registered. Use app.ws(path, handler) before calling wsReq().',
      )
    }
    this.wsServer = serve(this.router.handler(), {
      websocket: wsHandler,
    })
    await this.wsServer.ready
    return `http://localhost:${this.wsServer.port}`
  }

  /**
   * Internal: register a WS connection for cleanup.
   */
  /* @internal */ _trackConnection(conn: TestWSConnection): void {
    this.wsConnections.push(conn)
  }

  /**
   * Cleanup all WebSocket connections and stop the server.
   */
  async close(): Promise<void> {
    for (const conn of this.wsConnections) {
      try {
        conn.close()
      } catch {
        // ignore
      }
    }
    this.wsConnections = []
    if (this.wsServer) {
      this.wsServer.close()
      this.wsServer = null
    }
  }
}

// ── WebSocket Test Utilities ──────────────────────────────────────────────

/** Start building a WebSocket test connection. */
export class TestWSRequest {
  private app: TestApp
  private path: string
  private _timeout = 5000

  constructor(app: TestApp, path: string) {
    this.app = app
    this.path = path
  }

  /** Set the timeout for operations (default: 5000ms). */
  timeout(ms: number): this {
    this._timeout = ms
    return this
  }

  /**
   * Connect to the WebSocket endpoint.
   * Starts a real HTTP server (random port) if not already running.
   */
  async connect(): Promise<TestWSConnection> {
    const baseUrl = await this.app._ensureServer()
    const wsUrl = baseUrl.replace(/^http/, 'ws') + this.path

    const ws = new WSWebSocket(wsUrl, { handshakeTimeout: this._timeout })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timed out after ${this._timeout}ms`))
        ws.close()
      }, this._timeout)

      ws.on('open', () => {
        clearTimeout(timer)
        const conn = new TestWSConnection(ws, this._timeout)
        this.app._trackConnection(conn)
        resolve(conn)
      })

      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`WebSocket connection error: ${err.message}`))
      })

      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timer)
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => {
          reject(new Error(`WebSocket upgrade rejected (${res.statusCode}): ${body.slice(0, 200)}`))
        })
      })
    })
  }
}

/**
 * A connected WebSocket for testing.
 *
 * ```ts
 * const conn = await app.wsReq('/echo').connect()
 * conn.send('hello')
 * const msg = await conn.receive()
 * assert.equal(msg, 'hello')
 * conn.close()
 * ```
 */
export class TestWSConnection {
  private ws: WSWebSocket
  private _timeout: number
  private messageQueue: string[] = []
  private resolveQueue: Array<(msg: string) => void> = []
  private _closed = false

  constructor(ws: WSWebSocket, timeout = 5000) {
    this.ws = ws
    this._timeout = timeout

    ws.on('message', (data: Buffer) => {
      const str = data.toString()
      if (this.resolveQueue.length > 0) {
        const resolve = this.resolveQueue.shift()!
        resolve(str)
      } else {
        this.messageQueue.push(str)
      }
    })

    ws.on('close', () => {
      this._closed = true
      // Resolve any pending receives with close error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _r of this.resolveQueue) {
        // pending receives will reject on next tick when they detect closed
      }
    })
  }

  /** Send a text message. */
  send(data: string): void {
    this.ws.send(data)
  }

  /** Send a JSON message. */
  json(data: unknown): void {
    this.ws.send(JSON.stringify(data))
  }

  /**
   * Wait for the next message. Returns the raw text.
   * Throws on timeout or if the connection is closed.
   */
  async receive(timeout?: number): Promise<string> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!
    }

    if (this._closed) {
      throw new Error('WebSocket connection closed')
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.resolveQueue.indexOf(resolve as any)
        if (idx !== -1) this.resolveQueue.splice(idx, 1)
        reject(new Error(`WebSocket receive timed out after ${timeout ?? this._timeout}ms`))
      }, timeout ?? this._timeout)

      this.resolveQueue.push((msg: string) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })
  }

  /** Wait for the next message and parse as JSON. */
  async receiveJson<T = unknown>(): Promise<T> {
    const msg = await this.receive()
    return JSON.parse(msg) as T
  }

  /**
   * Assert that no message is received within the given silence period.
   * Useful for verifying that something did NOT happen.
   */
  async expectSilent(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.messageQueue.length > 0) {
        reject(new Error(`Expected silence but got message: ${this.messageQueue[0].slice(0, 100)}`))
        return
      }
      const timer = setTimeout(() => resolve(), ms)

      // If a message arrives during the silence period, fail
      const origPush = this.resolveQueue.push.bind(this.resolveQueue)
      this.resolveQueue.push = (_fn) => {
        clearTimeout(timer)
        reject(new Error('Expected silence but received a message'))
        return 0
      }

      // Restore after timeout
      setTimeout(() => {
        this.resolveQueue.push = origPush
      }, ms + 10).unref()
    })
  }

  /** Close the connection. */
  close(): void {
    this._closed = true
    this.ws.close()
  }

  /** Whether the connection is closed. */
  get closed(): boolean {
    return this._closed
  }
}

/** Create a new test app */
export function testApp(): TestApp {
  return new TestApp()
}

// ── Test Database Utilities ────────────────────────────────────────────────

/**
 * Result of createTestDb().
 */
export interface TestDb {
  /** Tagged-template SQL client connected to the test database. */
  sql: SqlClient
  /** Connection URL of the test database. */
  url: string
  /** Schema name used for this test session. */
  schema: string
  /** Destroy the test database (drop schema). */
  destroy: () => Promise<void>
}

/**
 * Create an isolated test database schema for integration testing.
 *
 * Uses PostgreSQL schemas for isolation — no separate database needed.
 * Each call creates a unique schema under the same database.
 *
 * ```ts
 * const db = await createTestDb()
 * await db.sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)`
 * // ... run tests ...
 * await db.destroy()  // drops the schema
 * ```
 *
 * Uses `TEST_DATABASE_URL` or `DATABASE_URL` env var.
 */
export async function createTestDb(options?: {
  /** Database URL. Default: TEST_DATABASE_URL or DATABASE_URL. */
  url?: string
  /** Schema name. Default: auto-generated 'test_<timestamp>_<random>'. */
  schema?: string
  /** Import postgres dynamically (avoid circular dep at module level). */
}): Promise<TestDb> {
  const dbUrl = options?.url || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!dbUrl) throw new Error('createTestDb: DATABASE_URL or TEST_DATABASE_URL required')

  const schema = options?.schema || `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Dynamic import to avoid circular dependency
  const { default: postgres } = await import('postgres')
  const adminSql = postgres(dbUrl)

  // Create schema — use double quotes for identifier (single-quoting via sql() doesn't work for DDL)
  await adminSql.unsafe('CREATE SCHEMA IF NOT EXISTS "' + schema.replace(/"/g, '""') + '"')

  // Set search_path to the schema
  const schemaUrl = new URL(dbUrl)
  schemaUrl.searchParams.set('search_path', schema)

  const sql = postgres(schemaUrl.toString())

  // Close the admin connection (only needed for schema creation)
  await adminSql.end()

  return {
    sql,
    url: schemaUrl.toString(),
    schema,
    destroy: async () => {
      const destroySql = postgres(dbUrl)
      await destroySql.unsafe('DROP SCHEMA IF EXISTS "' + schema.replace(/"/g, '""') + '" CASCADE')
      await destroySql.end()
      // Also close the main connection
      await sql.end()
    },
  }
}

/**
 * Run a test callback within an isolated transaction that is rolled back
 * after completion. This provides the fastest isolation — no cleanup needed.
 *
 * ```ts
 * await withTestDb(async (sql) => {
 *   await sql`INSERT INTO users ...`
 *   // All changes are rolled back after this callback returns
 * })
 * ```
 *
 * @param optionsOrFn Either a URL string or options object, or the callback directly.
 * @param fn Async callback receiving a tagged-template sql client.
 */
export async function withTestDb(
  optionsOrFn: string | { url?: string } | ((sql: SqlClient) => Promise<void>),
  fn?: (sql: SqlClient) => Promise<void>,
): Promise<void> {
  // Resolve arguments
  let dbUrl: string | undefined
  let callback: (sql: SqlClient) => Promise<void>

  if (typeof optionsOrFn === 'function') {
    callback = optionsOrFn
  } else if (typeof optionsOrFn === 'string') {
    dbUrl = optionsOrFn
    callback = fn!
  } else {
    dbUrl = optionsOrFn?.url
    callback = fn!
  }

  const resolvedUrl = dbUrl || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!resolvedUrl) throw new Error('withTestDb: DATABASE_URL or TEST_DATABASE_URL required')

  const { default: postgres } = await import('postgres')
  const sql = postgres(resolvedUrl)

  try {
    // sql.begin() auto-commits on success, rolls back on throw
    // We always throw to force rollback (test isolation pattern)
    await sql.begin(async (txSql: any) => {
      await callback(txSql as SqlClient)
      throw undefined // force rollback
    })
  } catch {
    // Expected — thrown to prevent commit
  } finally {
    await sql.end()
  }
}
