import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { seo, seoTags, seoMiddleware } from '../seo.ts'

describe('seo — robots.txt', () => {
  it('default allows all', async () => {
    const r = seo()
    const res = await r.handler()(
      new Request('http://localhost/robots.txt'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=utf-8')
    const body = await res.text()
    assert.match(body, /^User-agent: \*\nAllow: \/\n$/)
  })

  it('custom rules', async () => {
    const r = seo({
      robots: [
        { userAgent: 'Googlebot', allow: '/', disallow: '/admin' },
        { userAgent: '*', disallow: '/' },
      ],
    })
    const res = await r.handler()(
      new Request('http://localhost/robots.txt'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /^User-agent: Googlebot\nAllow: \/\nDisallow: \/admin\nUser-agent: \*\nDisallow: \/\n$/)
  })

  it('includes sitemap reference when sitemap is configured', async () => {
    const r = seo({
      sitemap: { urls: [{ loc: '/' }] },
      baseUrl: 'https://example.com',
    })
    const res = await r.handler()(
      new Request('http://localhost/robots.txt'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /Sitemap: https:\/\/example\.com\/sitemap\.xml/)
  })

  it('supports array allow/disallow', async () => {
    const r = seo({
      robots: [{
        userAgent: '*',
        allow: ['/', '/public'],
        disallow: ['/admin', '/api', '/private'],
      }],
    })
    const res = await r.handler()(
      new Request('http://localhost/robots.txt'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /Allow: \/\nAllow: \/public/)
    assert.match(body, /Disallow: \/admin\nDisallow: \/api\nDisallow: \/private/)
  })
})

describe('seo — sitemap.xml', () => {
  it('generates empty sitemap with no URLs', async () => {
    const r = seo({ sitemap: {} })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'application/xml; charset=utf-8')
    const body = await res.text()
    assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.match(body, /<\/urlset>/)
  })

  it('generates sitemap with URLs', async () => {
    const r = seo({
      sitemap: {
        urls: [
          { loc: 'https://example.com/', priority: 1.0, changefreq: 'daily' },
          { loc: 'https://example.com/about', changefreq: 'monthly', priority: 0.8 },
        ],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /<loc>https:\/\/example\.com\/<\/loc>/)
    assert.match(body, /<loc>https:\/\/example\.com\/about<\/loc>/)
    assert.match(body, /<changefreq>daily<\/changefreq>/)
    assert.match(body, /<priority>1\.0<\/priority>/)
    assert.match(body, /<priority>0\.8<\/priority>/)
  })

  it('includes lastmod when provided', async () => {
    const r = seo({
      sitemap: {
        urls: [{ loc: '/', lastmod: '2026-01-15' }],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /<lastmod>2026-01-15<\/lastmod>/)
  })

  it('resolves dynamic URLs via resolve callback', async () => {
    const r = seo({
      sitemap: {
        urls: [{ loc: '/static', changefreq: 'yearly' }],
        resolve: async () => [
          { loc: '/blog/post-1', lastmod: '2026-06-01' },
          { loc: '/blog/post-2', lastmod: '2026-06-02' },
        ],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /<loc>\/static<\/loc>/)
    assert.match(body, /<loc>\/blog\/post-1<\/loc>/)
    assert.match(body, /<loc>\/blog\/post-2<\/loc>/)
    assert.match(body, /<lastmod>2026-06-01<\/lastmod>/)
  })

  it('caches sitemap and respects cache TTL', async () => {
    let callCount = 0
    const r = seo({
      sitemap: {
        resolve: async () => {
          callCount++
          return [{ loc: `https://example.com/${callCount}` }]
        },
        cacheTTL: 60_000,
      },
    })
    const handler = r.handler()
    const ctx = { params: {}, query: {} } as Context

    const res1 = await handler(new Request('http://localhost/sitemap.xml'), ctx)
    const body1 = await res1.text()

    const res2 = await handler(new Request('http://localhost/sitemap.xml'), ctx)
    const body2 = await res2.text()

    assert.equal(callCount, 1)
    assert.equal(body1, body2)
  })

  it('resolves relative paths with baseUrl', async () => {
    const r = seo({
      baseUrl: 'https://example.com',
      sitemap: {
        urls: [
          { loc: '/', priority: 1.0 },
          { loc: '/about', priority: 0.8 },
        ],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /<loc>https:\/\/example\.com\/<\/loc>/)
    assert.match(body, /<loc>https:\/\/example\.com\/about<\/loc>/)
  })

  it('does not double-slash baseUrl', async () => {
    const r = seo({
      baseUrl: 'https://example.com/',
      sitemap: {
        urls: [{ loc: '/page' }],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /<loc>https:\/\/example\.com\/page<\/loc>/)
  })

  it('escapes XML special characters in loc', async () => {
    const r = seo({
      sitemap: {
        urls: [{ loc: '/page?q=a&b=c' }],
      },
    })
    const res = await r.handler()(
      new Request('http://localhost/sitemap.xml'),
      { params: {}, query: {} } as Context,
    )
    const body = await res.text()
    assert.match(body, /page\?q=a&amp;b=c/)
  })
})

describe('seoTags', () => {
  it('generates title and description', () => {
    const tags = seoTags({ title: 'My Page', description: 'A great page' })
    assert.match(tags, /<title>My Page<\/title>/)
    assert.match(tags, /<meta property="og:title" content="My Page">/)
    assert.match(tags, /<meta name="twitter:title" content="My Page">/)
    assert.match(tags, /<meta name="description" content="A great page">/)
    assert.match(tags, /<meta property="og:description" content="A great page">/)
    assert.match(tags, /<meta name="twitter:description" content="A great page">/)
  })

  it('generates OG image and twitter card', () => {
    const tags = seoTags({
      ogImage: 'https://example.com/image.png',
      twitterCard: 'summary_large_image',
    })
    assert.match(tags, /<meta property="og:image" content="https:\/\/example\.com\/image\.png">/)
    assert.match(tags, /<meta name="twitter:image" content="https:\/\/example\.com\/image\.png">/)
    assert.match(tags, /<meta name="twitter:card" content="summary_large_image">/)
  })

  it('generates canonical link', () => {
    const tags = seoTags({ canonical: 'https://example.com/page' })
    assert.match(tags, /<link rel="canonical" href="https:\/\/example\.com\/page">/)
  })

  it('respects ogTitle and ogDescription overrides', () => {
    const tags = seoTags({
      title: 'Page Title',
      ogTitle: 'OG Title',
      description: 'Page Desc',
      ogDescription: 'OG Desc',
    })
    assert.match(tags, /<meta property="og:title" content="OG Title">/)
    assert.match(tags, /<meta property="og:description" content="OG Desc">/)
  })

  it('escapes HTML in tag values', () => {
    const tags = seoTags({ title: 'Foo & Bar <3' })
    assert.match(tags, /Foo &amp; Bar &lt;3/)
  })

  it('returns empty string for empty config', () => {
    assert.equal(seoTags({}), '')
  })
})

describe('seoMiddleware', () => {
  it('sets X-Robots-Tag from string value', async () => {
    const mw = seoMiddleware({ headers: { 'X-Robots-Tag': 'noindex' } })
    const res = await mw(
      new Request('http://localhost/page'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex')
  })

  it('sets X-Robots-Tag from function based on path', async () => {
    const mw = seoMiddleware({
      headers: {
        'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined,
      },
    })
    const adminRes = await mw(
      new Request('http://localhost/admin/dashboard'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(adminRes.headers.get('X-Robots-Tag'), 'noindex')

    const publicRes = await mw(
      new Request('http://localhost/about'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok'),
    )
    assert.equal(publicRes.headers.get('X-Robots-Tag'), null)
  })

  it('passes through when no headers config', async () => {
    const next = async () => new Response('ok', { headers: { 'x-custom': 'val' } })
    const mw = seoMiddleware()
    const res = await mw(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
      next,
    )
    assert.equal(res.headers.get('x-custom'), 'val')
    assert.equal(res.headers.get('X-Robots-Tag'), null)
  })

  it('preserves other headers when setting X-Robots-Tag', async () => {
    const mw = seoMiddleware({ headers: { 'X-Robots-Tag': 'noindex' } })
    const res = await mw(
      new Request('http://localhost/page'),
      { params: {}, query: {} } as Context,
      async () => new Response('ok', { headers: { 'content-type': 'text/html' } }),
    )
    assert.equal(res.headers.get('content-type'), 'text/html')
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex')
  })
})
