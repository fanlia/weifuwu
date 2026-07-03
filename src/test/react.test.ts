import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'
import { react } from '../react/index.ts'
import type { Server } from '../core/serve.ts'

const TEST_DIR = resolve(process.cwd(), 'src/test/.react-test-pages')

describe('react SSR', () => {
  let servers: Server[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  before(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    await writeFile(resolve(TEST_DIR, 'Hello.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export function Hello() {
        const data = useServerData()
        return <html><head><title>Test</title></head><body><h1>Hello</h1><p>{JSON.stringify(data)}</p></body></html>
      }
    `)
    await writeFile(resolve(TEST_DIR, 'Check.tsx'), `
      export function Check() {
        return <html><body><main>hi</main></body></html>
      }
    `)
    await writeFile(resolve(TEST_DIR, 'DataPage.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export function DataPage() {
        const data = useServerData()
        return <html><body><div>{JSON.stringify(data)}</div></body></html>
      }
    `)
  })

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  function start(app: Router): Server {
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  it('ctx.render returns HTML', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) => ctx.render('src/test/.react-test-pages/Hello.tsx'))

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    const text = await res.text()

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type')!, /text\/html/)
    assert.match(text, /^<!DOCTYPE html>/)
    assert.match(text, /<h1>Hello<\/h1>/)
  })

  it('ctx.render returns custom status code', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Hello.tsx', { status: 404 }),
    )

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 404)
  })

  it('injects bootstrapModules', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx', {
        bootstrapModules: ['/app.js'],
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /type="module"/)
    assert.match(text, /app\.js/)
  })

  it('useServerData reads from ServerDataContext', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/DataPage.tsx', { data: { user: 'Alice' } }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /user.*Alice/)
  })

  it('injects stylesheets as <link> tags', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx', {
        stylesheets: ['/a.css', '/b.css'],
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /rel="stylesheet"/)
    assert.match(text, /href="\/a\.css"/)
    assert.match(text, /href="\/b\.css"/)
  })

  it('coexists with non-React routes', async () => {
    const app = new Router()
    app.use(react())
    app.get('/api', () => Response.json({ ok: true }))
    app.get('/page', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx'),
    )

    const s = start(app)
    await s.ready

    assert.deepEqual(await (await fetch(`http://localhost:${s.port}/api`)).json(), { ok: true })
    assert.match(await (await fetch(`http://localhost:${s.port}/page`)).text(), /<main>hi<\/main>/)
  })
})
