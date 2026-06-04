import type { Middleware } from './types.ts'

export interface HelmetOptions {
  contentSecurityPolicy?: string | false
  crossOriginEmbedderPolicy?: string | false
  crossOriginOpenerPolicy?: string | false
  crossOriginResourcePolicy?: string | false
  originAgentCluster?: string | false
  referrerPolicy?: string | false
  strictTransportSecurity?: string | false
  xContentTypeOptions?: string | false
  xDnsPrefetchControl?: string | false
  xDownloadOptions?: string | false
  xFrameOptions?: string | false
  xPermittedCrossDomainPolicies?: string | false
  xXssProtection?: string | false
  permissionsPolicy?: string | false
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

export function helmet(options?: HelmetOptions): Middleware {
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
