import type { Middleware, Context } from './types.ts'

/** Options for {@link helmet}. Set any header to `false` to omit it. */
export interface HelmetOptions {
  /** `Content-Security-Policy` header value. */
  contentSecurityPolicy?: string | false
  /** `Cross-Origin-Embedder-Policy` header value. */
  crossOriginEmbedderPolicy?: string | false
  /** `Cross-Origin-Opener-Policy` header value. */
  crossOriginOpenerPolicy?: string | false
  /** `Cross-Origin-Resource-Policy` header value. */
  crossOriginResourcePolicy?: string | false
  /** `Origin-Agent-Cluster` header value. */
  originAgentCluster?: string | false
  /** `Referrer-Policy` header value. */
  referrerPolicy?: string | false
  /** `Strict-Transport-Security` header value. */
  strictTransportSecurity?: string | false
  /** `X-Content-Type-Options` header value. */
  xContentTypeOptions?: string | false
  /** `X-DNS-Prefetch-Control` header value. */
  xDnsPrefetchControl?: string | false
  /** `X-Download-Options` header value. */
  xDownloadOptions?: string | false
  /** `X-Frame-Options` header value. */
  xFrameOptions?: string | false
  /** `X-Permitted-Cross-Domain-Policies` header value. */
  xPermittedCrossDomainPolicies?: string | false
  /** `X-XSS-Protection` header value. */
  xXssProtection?: string | false
  /** `Permissions-Policy` header value. */
  permissionsPolicy?: string | false
}

/**
 * Security headers middleware. Sets sensible defaults for all major security headers.
 *
 * ```ts
 * import { helmet } from 'weifuwu'
 * app.use(helmet())
 *
 * // Customize or disable specific headers
 * app.use(helmet({ contentSecurityPolicy: false, xFrameOptions: 'DENY' }))
 * ```
 */
const HEADER_MAP: Record<string, keyof HelmetOptions> = {
  'Content-Security-Policy': 'contentSecurityPolicy',
  'Cross-Origin-Embedder-Policy': 'crossOriginEmbedderPolicy',
  'Cross-Origin-Opener-Policy': 'crossOriginOpenerPolicy',
  'Cross-Origin-Resource-Policy': 'crossOriginResourcePolicy',
  'Origin-Agent-Cluster': 'originAgentCluster',
  'Referrer-Policy': 'referrerPolicy',
  'Strict-Transport-Security': 'strictTransportSecurity',
  'X-Content-Type-Options': 'xContentTypeOptions',
  'X-DNS-Prefetch-Control': 'xDnsPrefetchControl',
  'X-Download-Options': 'xDownloadOptions',
  'X-Frame-Options': 'xFrameOptions',
  'X-Permitted-Cross-Domain-Policies': 'xPermittedCrossDomainPolicies',
  'X-XSS-Protection': 'xXssProtection',
  'Permissions-Policy': 'permissionsPolicy',
}

export function helmet(options?: HelmetOptions): Middleware<Context, Context> {
  const opts = { ...DEFAULTS, ...options } as HelmetOptions

  const headers = new Headers()
  for (const [header, key] of Object.entries(HEADER_MAP)) {
    const val = opts[key]
    if (val !== false && val !== undefined) headers.set(header, val)
  }

  return async (req, ctx, next) => {
    const res = await next(req, ctx)
    const h = new Headers(res.headers)
    for (const [k, v] of headers) {
      if (!h.has(k)) h.set(k, v)
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  }
}

const DEFAULTS: HelmetOptions = {
  contentSecurityPolicy: "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  originAgentCluster: '?1',
  referrerPolicy: 'no-referrer',
  strictTransportSecurity: 'max-age=15552000; includeSubDomains',
  xContentTypeOptions: 'nosniff',
  xDnsPrefetchControl: 'off',
  xDownloadOptions: 'noopen',
  xFrameOptions: 'SAMEORIGIN',
  xPermittedCrossDomainPolicies: 'none',
  xXssProtection: '0',
  permissionsPolicy: 'camera=(),display-capture=(),fullscreen=(),geolocation=(),microphone=()',
}


