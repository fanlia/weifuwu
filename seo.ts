import type { Handler, Middleware, Context } from './types.ts'
import { Router } from './router.ts'

/** A rule in `robots.txt`. */
export interface RobotsRule {
  /** User-agent this rule applies to (default: `'*'`). */
  userAgent?: string
  /** Path(s) to allow. */
  allow?: string | string[]
  /** Path(s) to disallow. */
  disallow?: string | string[]
}

/** A URL entry in `sitemap.xml`. */
export interface SitemapUrl {
  /** Absolute URL of the page. */
  loc: string
  /** Last modification date (ISO 8601). */
  lastmod?: string
  /** Expected change frequency. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Priority (0.0 to 1.0). */
  priority?: number
}

/** Configuration for sitemap generation. */
export interface SitemapConfig {
  /** Static list of URLs to include. */
  urls?: SitemapUrl[]
  /** Dynamic URL resolver (called on each sitemap request, or cached per `cacheTTL`). */
  resolve?: () => SitemapUrl[] | Promise<SitemapUrl[]>
  /** Cache TTL in ms (default: 3600000 = 1 hour). Set 0 to disable cache. */
  cacheTTL?: number
}

/** Configuration for per-path response headers. */
export interface SeoHeadersConfig {
  /** `X-Robots-Tag` header value. Use a function for path-dependent values. */
  'X-Robots-Tag'?: string | ((path: string) => string | undefined)
}

/** Options for {@link seo}. */
export interface SeoOptions {
  /** Rules for `robots.txt`. */
  robots?: RobotsRule[]
  /** Configuration for `sitemap.xml`. */
  sitemap?: SitemapConfig
  /** Per-path response headers. */
  headers?: SeoHeadersConfig
  baseUrl?: string
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function buildRobotsTxt(rules: RobotsRule[], sitemapUrl?: string): string {
  const lines: string[] = []
  for (const rule of rules) {
    lines.push(`User-agent: ${rule.userAgent ?? '*'}`)
    if (rule.allow) {
      for (const a of Array.isArray(rule.allow) ? rule.allow : [rule.allow]) {
        lines.push(`Allow: ${a}`)
      }
    }
    if (rule.disallow) {
      for (const d of Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]) {
        lines.push(`Disallow: ${d}`)
      }
    }
  }
  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`)
  }
  lines.push('')
  return lines.join('\n')
}

function buildSitemapXml(urls: SitemapUrl[], baseUrl?: string): string {
  if (urls.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>
`
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`
  for (const url of urls) {
    let loc = url.loc
    if (baseUrl && loc.startsWith('/')) {
      loc = baseUrl.replace(/\/+$/, '') + loc
    }
    xml += `  <url>
    <loc>${escapeXml(loc)}</loc>`
    if (url.lastmod) {
      xml += `
    <lastmod>${escapeXml(url.lastmod)}</lastmod>`
    }
    if (url.changefreq) {
      xml += `
    <changefreq>${escapeXml(url.changefreq)}</changefreq>`
    }
    if (url.priority !== undefined) {
      xml += `
    <priority>${url.priority.toFixed(1)}</priority>`
    }
    xml += `
  </url>
`
  }
  xml += `</urlset>
`
  return xml
}

function getRobotsHeader(headers: SeoHeadersConfig | undefined, path: string): string | undefined {
  if (!headers?.['X-Robots-Tag']) return undefined
  const val = headers['X-Robots-Tag']
  if (typeof val === 'function') return val(path)
  return val
}

/**
 * SEO middleware — sets `X-Robots-Tag` headers per path.
 * Used standalone or included automatically by {@link seo}.
 *
 * ```ts
 * app.use(seoMiddleware({
 *   headers: { 'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined },
 * }))
 * ```
 */
export function seoMiddleware(options?: SeoOptions): Middleware {
  const headers = options?.headers
  return async (req: Request, ctx: Context, next: Handler) => {
    const res = await next(req, ctx)
    if (!headers) return res
    const url = new URL(req.url)
    const robotTag = getRobotsHeader(headers, url.pathname)
    if (robotTag) {
      const h = new Headers(res.headers)
      h.set('X-Robots-Tag', robotTag)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
    }
    return res
  }
}

/**
 * SEO module — serves `robots.txt` and `sitemap.xml`.
 *
 * ```ts
 * import { seo } from 'weifuwu'
 *
 * app.use(seo({
 *   robots: [{ userAgent: '*', allow: '/', disallow: '/admin' }],
 *   sitemap: {
 *     resolve: async () => [
 *       { loc: 'https://example.com/', changefreq: 'daily', priority: 1.0 },
 *     ],
 *   },
 * }))
 * ```
 */
export function seo(options?: SeoOptions): Router {
  const { robots, sitemap: sitemapConfig, baseUrl } = options ?? {}
  const r = new Router()

  const robotsHandler: Handler = () => {
    const sitemapUrl = sitemapConfig ? `${baseUrl ?? ''}/sitemap.xml` : undefined
    const body = buildRobotsTxt(robots ?? [{ userAgent: '*', allow: '/' }], sitemapUrl)
    return new Response(body, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  let cached: string | null = null
  let cacheTime = 0
  const cacheTTL = sitemapConfig?.cacheTTL ?? 3_600_000

  const sitemapHandler: Handler = async () => {
    if (cached && Date.now() - cacheTime < cacheTTL) {
      return new Response(cached, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      })
    }

    const urls: SitemapUrl[] = [...(sitemapConfig?.urls ?? [])]
    if (sitemapConfig?.resolve) {
      const dynamic = await sitemapConfig.resolve()
      urls.push(...dynamic)
    }

    const xml = buildSitemapXml(urls, baseUrl)
    cached = xml
    cacheTime = Date.now()

    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  r.get('/robots.txt', robotsHandler)
  r.get('/sitemap.xml', sitemapHandler)

  return r
}

/** Options for {@link seoTags}. */
export interface SeoTagsConfig {
  /** Page title (`<title>` + `og:title`). */
  title?: string
  /** Meta description. */
  description?: string
  /** Open Graph image URL. */
  ogImage?: string
  /** Override `og:title` (defaults to `title`). */
  ogTitle?: string
  /** Override `og:description` (defaults to `description`). */
  ogDescription?: string
  /** Twitter card type. */
  twitterCard?: 'summary' | 'summary_large_image'
  /** Canonical URL (`<link rel="canonical">`). */
  canonical?: string
}

/**
 * Generate `<meta>` and `<link>` tag HTML string for SEO.
 *
 * ```ts
 * const tags = seoTags({
 *   title: 'My App',
 *   description: 'A description',
 *   ogImage: 'https://example.com/og.png',
 * })
 * // <meta name="description" content="A description" />...
 * ```
 */
export function seoTags(config: SeoTagsConfig): string {
  const tags: string[] = []
  if (config.title) {
    tags.push(`<title>${escapeXml(config.title)}</title>`)
    tags.push(`<meta property="og:title" content="${escapeXml(config.title)}">`)
    tags.push(`<meta name="twitter:title" content="${escapeXml(config.title)}">`)
  }
  if (config.description) {
    tags.push(`<meta name="description" content="${escapeXml(config.description)}">`)
    tags.push(`<meta property="og:description" content="${escapeXml(config.description)}">`)
    tags.push(`<meta name="twitter:description" content="${escapeXml(config.description)}">`)
  }
  if (config.ogTitle) {
    tags.push(`<meta property="og:title" content="${escapeXml(config.ogTitle)}">`)
  }
  if (config.ogDescription) {
    tags.push(`<meta property="og:description" content="${escapeXml(config.ogDescription)}">`)
  }
  if (config.ogImage) {
    tags.push(`<meta property="og:image" content="${escapeXml(config.ogImage)}">`)
    tags.push(`<meta name="twitter:image" content="${escapeXml(config.ogImage)}">`)
  }
  if (config.twitterCard) {
    tags.push(`<meta name="twitter:card" content="${escapeXml(config.twitterCard)}">`)
  }
  if (config.canonical) {
    tags.push(`<link rel="canonical" href="${escapeXml(config.canonical)}">`)
  }
  return tags.join('\n')
}
