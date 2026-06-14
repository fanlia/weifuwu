import type { Middleware, Context } from './types.ts'

/** Options for {@link cors}. */
export interface CORSOptions {
  /** Allowed origin(s). Default `'*'`. If `credentials: true`, reflects the request origin. */
  origin?: string | string[] | ((origin: string) => string | boolean | undefined)
  /** Allowed HTTP methods. Default: `GET, HEAD, PUT, PATCH, POST, DELETE`. */
  methods?: string[]
  /** Allowed request headers. Default: `Content-Type, Authorization`. */
  allowedHeaders?: string[]
  /** Exposed response headers. */
  exposedHeaders?: string[]
  /** Whether to expose `Access-Control-Allow-Credentials`. */
  credentials?: boolean
  /** `Access-Control-Max-Age` in seconds. */
  maxAge?: number
}

/**
 * CORS middleware.
 *
 * ```ts
 * import { cors } from 'weifuwu'
 * app.use(cors({ origin: 'https://myapp.com', credentials: true }))
 * ```
 */
export function cors(options?: CORSOptions): Middleware<Context, Context> {
  const opts: Required<Pick<CORSOptions, 'origin' | 'methods' | 'allowedHeaders'>> & CORSOptions = {
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    ...options,
  }

  function resolveOrigin(requestOrigin: string): string {
    if (typeof opts.origin === 'string') {
      if (opts.origin === '*') {
        return opts.credentials ? requestOrigin : '*'
      }
      return opts.origin
    }
    if (Array.isArray(opts.origin)) {
      return opts.origin.includes(requestOrigin) ? requestOrigin : ''
    }
    const result = opts.origin(requestOrigin)
    if (typeof result === 'boolean') return result ? requestOrigin : ''
    if (typeof result === 'string') return result
    return ''
  }

  function setCORSHeaders(res: Response, acao: string): Response {
    if (!acao) return res
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', acao)
    if (opts.credentials) headers.set('Access-Control-Allow-Credentials', 'true')
    if (opts.exposedHeaders?.length) headers.set('Access-Control-Expose-Headers', opts.exposedHeaders.join(', '))
    if (acao !== '*') headers.set('Vary', 'Origin')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }

  return (req, ctx, next) => {
    const requestOrigin = req.headers.get('origin') ?? ''
    const acao = resolveOrigin(requestOrigin)

    if (req.method === 'OPTIONS' && acao) {
      const headers = new Headers()
      headers.set('Access-Control-Allow-Origin', acao)
      headers.set('Access-Control-Allow-Methods', opts.methods.join(', '))
      headers.set('Access-Control-Allow-Headers', opts.allowedHeaders.join(', '))
      if (opts.credentials) headers.set('Access-Control-Allow-Credentials', 'true')
      if (opts.maxAge != null) headers.set('Access-Control-Max-Age', String(opts.maxAge))
      if (acao !== '*') headers.set('Vary', 'Origin')
      return new Response(null, { status: 204, headers })
    }

    if (!acao) return next(req, ctx)

    return Promise.resolve(next(req, ctx)).then((res) => setCORSHeaders(res, acao))
  }
}
