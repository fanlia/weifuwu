/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context, Handler } from './types.ts'
import type { Sql } from './vendor.ts'
import { Router } from './router.ts'

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
    this.ctxMixin.user = user
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

  constructor() {
    this.router = new Router()
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
  sql: Sql<{}>
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
 * await db.sql\`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)\`
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
 *   await sql\`INSERT INTO users ...\`
 *   // All changes are rolled back after this callback returns
 * })
 * ```
 *
 * @param optionsOrFn Either a URL string or options object, or the callback directly.
 * @param fn Async callback receiving a tagged-template sql client.
 */
export async function withTestDb(
  optionsOrFn: string | { url?: string } | ((sql: Sql<{}>) => Promise<void>),
  fn?: (sql: Sql<{}>) => Promise<void>,
): Promise<void> {
  // Resolve arguments
  let dbUrl: string | undefined
  let callback: (sql: Sql<{}>) => Promise<void>

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
      await callback(txSql as Sql<{}>)
      throw undefined // force rollback
    })
  } catch {
    // Expected — thrown to prevent commit
  } finally {
    await sql.end()
  }
}
