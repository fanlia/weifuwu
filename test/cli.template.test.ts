import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Router } from 'weifuwu'

const templateDir = './cli/template'

describe('cli/template structure', () => {
  const files = ['app.ts', 'index.ts', 'ui/layout.tsx', 'ui/page.tsx', 'ui/app.css']
  for (const f of files) {
    it(`has ${f}`, () => {
      assert.ok(existsSync(join(templateDir, f)), `missing ${f}`)
    })
  }
})

describe('template app', () => {
  let app: Router
  const origCwd = process.cwd()

  before(async () => {
    process.chdir(resolve(templateDir))
    const m = await import('../cli/template/app.ts')
    app = m.app
  })

  after(() => {
    process.chdir(origCwd)
  })

  it('GET / returns 200 with SSR HTML', async () => {
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<html/)
    assert.match(html, /Hello, Weifuwu/)
    assert.match(html, /__ssr\//)
    assert.match(html, /__WEIFUWU_CTX/)
  })

  it('GET /__ssr/[hash].js serves hydration bundle', async () => {
    const res1 = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const m = res1.text().then(h => h.match(/src="(\/__ssr\/[^"]+)"/))
    const src = await m
    assert.ok(src, 'hydration script src found')

    const res2 = await app.handler()(
      new Request(`http://localhost${src![1]}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res2.status, 200)
    assert.match(res2.headers.get('content-type') || '', /application\/javascript/)
    const js = await res2.text()
    assert.match(js, /hydrateRoot/)
  })

  it('GET /api/ping returns JSON', async () => {
    const res = await app.handler()(
      new Request('http://localhost/api/ping'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.pong, true)
    assert.ok(typeof data.time === 'string')
  })
})
