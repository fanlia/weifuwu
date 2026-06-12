import type { Context, Handler } from './types.ts'
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
}

export class TestRequest {
  private headers: Record<string, string> = {}
  private ctxMixin: Partial<Context> = {}
  private bodyData: BodyInit | null = null
  private app: TestApp
  private method: string
  private path: string

  constructor(
    app: TestApp,
    method: string,
    path: string,
  ) {
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

  /** Register a GET route */
  get(path: string, handler: Handler): this {
    this.router.get(path, handler)
    return this
  }

  /** Register a POST route */
  post(path: string, handler: Handler): this {
    this.router.post(path, handler)
    return this
  }

  /** Register a PUT route */
  put(path: string, handler: Handler): this {
    this.router.put(path, handler)
    return this
  }

  /** Register a PATCH route */
  patch(path: string, handler: Handler): this {
    this.router.patch(path, handler)
    return this
  }

  /** Register a DELETE route */
  delete(path: string, handler: Handler): this {
    this.router.delete(path, handler)
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
