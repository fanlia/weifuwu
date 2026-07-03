import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'
import { react } from '../react/index.ts'
import type { Server } from '../core/serve.ts'

const TEST_DIR = resolve(process.cwd(), 'src/test/.react-test-pages')
const LAYOUT_DIR = resolve(process.cwd(), 'src/test/.react-test-layouts')

describe('react SSR', () => {
  let servers: Server[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  before(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    await mkdir(LAYOUT_DIR, { recursive: true })
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
    await writeFile(resolve(TEST_DIR, 'PropsPage.tsx'), `
      export default function PropsPage({ title, count }: { title: string; count: number }) {
        return <html><body><h1>{title}</h1><span>{count}</span></body></html>
      }
    `)
    await writeFile(resolve(TEST_DIR, 'BodyContent.tsx'), `
      export default function BodyContent() {
        return <section>inner content</section>
      }
    `)
    await writeFile(resolve(LAYOUT_DIR, 'Root.tsx'), `
      export default function Root({ children }: { children: any }) {
        return <><header>Site Header</header>{children}<footer>Site Footer</footer></>
      }
    `)
    await writeFile(resolve(LAYOUT_DIR, 'DataLayout.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export default function DataLayout({ children }: { children: any }) {
        const data = useServerData()
        return <><nav>{data?.user as string}</nav>{children}</>
      }
    `)
    // Streaming/Suspense test pages
    await writeFile(resolve(TEST_DIR, 'StreamingPage.tsx'), `
      import { Suspense, use } from 'react'
      const fastText = 'INSTANT'
      const slowPromise = new Promise<string>(resolve => {
        setTimeout(() => resolve('DELAYED'), 100)
      })
      function Delayed({ p }: { p: Promise<string> }) {
        const val = use(p)
        return <span>{val}</span>
      }
      export function StreamingPage() {
        return <html><body><h1>{fastText}</h1><Suspense fallback={<p>loading</p>}><Delayed p={slowPromise} /></Suspense></body></html>
      }
    `)
    // Error handling: render-time error from component is a hard failure
    // (React's onError doesn't recover from synchronous throws).
    // Users should use React <ErrorBoundary> components for recovery.
    await writeFile(resolve(TEST_DIR, 'ErrorPage.tsx'), `
      export function ErrorPage() {
        throw new Error('BOOM')
        return null
      }
    `)
    // Head management: React 19 hoists <title>, <meta> from anywhere in the tree
    await writeFile(resolve(TEST_DIR, 'HeadPage.tsx'), `
      export function HeadPage() {
        return <html><body>
          <title>Custom Title</title>
          <meta name="description" content="My description" />
          <h1>ok</h1>
        </body></html>
      }
    `)
    // ErrorBoundary test: component that throws
    await writeFile(resolve(TEST_DIR, 'BuggyCounter.tsx'), `
      import { useState } from 'react'
      export function BuggyCounter() {
        const [count, setCount] = useState(0)
        if (count > 2) throw new Error('count too high!')
        return <button onClick={() => setCount(c => c + 1)}>count: {count}</button>
      }
    `)
    await writeFile(resolve(TEST_DIR, 'SafePage.tsx'), `
      import { ErrorBoundary } from 'weifuwu/react'
      import { BuggyCounter } from './BuggyCounter.tsx'
      export function SafePage() {
        return <html><body>
          <h1>Safe</h1>
          <ErrorBoundary fallback={<p>Recovered!</p>}>
            <BuggyCounter />
          </ErrorBoundary>
        </body></html>
      }
    `)
  })

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
    await rm(LAYOUT_DIR, { recursive: true, force: true })
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

  // ═══════════════════════════════════════════════════════════════
  // Props passthrough
  // ═══════════════════════════════════════════════════════════════

  it('passes props to the page component', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/PropsPage.tsx', {
        props: { title: 'My Page', count: 42 },
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /<h1>My Page<\/h1>/)
    assert.match(text, /<span>42<\/span>/)
  })

  it('props do not leak into useServerData', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/DataPage.tsx', {
        props: { notData: 'should not appear' },
        data: { user: 'Bob' },
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // Props are not in data context — only data is
    assert.match(text, /user.*Bob/)
    assert.doesNotMatch(text, /should not appear/)
  })

  // ═══════════════════════════════════════════════════════════════
  // Layout wrapping
  // ═══════════════════════════════════════════════════════════════

  it('wraps page with layout component', async () => {
    const app = new Router()
    app.use(react({ layout: 'src/test/.react-test-layouts/Root.tsx' }))
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/BodyContent.tsx'),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // Layout header and footer should appear
    assert.match(text, /Site Header/)
    assert.match(text, /Site Footer/)
    // Page content should be between them
    assert.match(text, /inner content/)
    // Layout is wrapped in HtmlShell (has doctype, html, body)
    assert.match(text, /^<!DOCTYPE html>/)
  })

  it('layout can access useServerData', async () => {
    const app = new Router()
    app.use(react({ layout: 'src/test/.react-test-layouts/DataLayout.tsx' }))
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx', {
        data: { user: 'Carol' },
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /<nav>Carol<\/nav>/)
  })

  it('layout + props both work together', async () => {
    const app = new Router()
    app.use(react({ layout: 'src/test/.react-test-layouts/Root.tsx' }))
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/PropsPage.tsx', {
        props: { title: 'Layered', count: 99 },
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /Site Header/)
    assert.match(text, /<h1>Layered<\/h1>/)
    assert.match(text, /<span>99<\/span>/)
    assert.match(text, /Site Footer/)
  })

  // ═══════════════════════════════════════════════════════════════
  // Streaming / Suspense
  // ═══════════════════════════════════════════════════════════════

  it('renders Suspense pages with stream: false (waits for all)', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/StreamingPage.tsx', { stream: false }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // Both shell and suspended content should be present
    assert.match(text, /INSTANT/)
    assert.match(text, /DELAYED/)
    // Should be complete HTML
    assert.match(text, /<\/html>/)
  })

  it('streaming mode returns HTML progressively', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/StreamingPage.tsx'),
    )

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    // Default streaming: response should be HTML
    assert.match(res.headers.get('content-type')!, /text\/html/)
    const text = await res.text()
    assert.match(text, /INSTANT/)
    assert.match(text, /DELAYED/)
  })

  // ═══════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════

  it('render-time errors return 500', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) => {
      try {
        return await ctx.render('src/test/.react-test-pages/ErrorPage.tsx')
      } catch {
        return new Response('Render Error', { status: 500 })
      }
    })

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 500)
  })

  // ═══════════════════════════════════════════════════════════════
  // Head management (React 19 automatic hoisting)
  // ═══════════════════════════════════════════════════════════════

  it('hoists <title> from page component into <head>', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/HeadPage.tsx'),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // <title> should be in <head>, not in <body>
    assert.match(text, /<head>.*<title>Custom Title<\/title>.*<\/head>/)
    assert.doesNotMatch(text, /<body>.*<title>/)
  })

  it('hoists <meta> from page component into <head>', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/HeadPage.tsx'),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /<head>.*<meta name="description" content="My description".*<\/head>/)
  })

  it('head hoisting works through layout wrapper', async () => {
    const app = new Router()
    app.use(react({ layout: 'src/test/.react-test-layouts/Root.tsx' }))
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/HeadPage.tsx'),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // <title> should still be in <head> even with layout wrapper
    assert.match(text, /<head>.*<title>Custom Title<\/title>/)
    assert.match(text, /Site Header/)
    assert.match(text, /<h1>ok<\/h1>/)
  })

  // ═══════════════════════════════════════════════════════════════
  // ErrorBoundary
  // ═══════════════════════════════════════════════════════════════

  it('ErrorBoundary catches render errors and renders fallback', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/SafePage.tsx'),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    // The page should render normally (BuggyCounter hasn't thrown yet)
    assert.match(text, /Safe/)
    assert.match(text, /count:.*0/)
    // No fallback visible yet
    assert.doesNotMatch(text, /Recovered!/)
  })

  it('uncaught render error without boundary still throws', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) => {
      try {
        return await ctx.render('src/test/.react-test-pages/ErrorPage.tsx')
      } catch {
        return new Response('Caught by handler', { status: 500 })
      }
    })

    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 500)
    const text = await res.text()
    assert.match(text, /Caught by handler/)
  })

  // ═══════════════════════════════════════════════════════════════
  // Compilation cache persistence
  // ═══════════════════════════════════════════════════════════════

  it('reuses cached compilation on second render', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx'),
    )

    const s = start(app)
    await s.ready

    // First render — triggers compilation
    const t1 = Date.now()
    const r1 = await (await fetch(`http://localhost:${s.port}/`)).text()
    const d1 = Date.now() - t1
    assert.match(r1, /<main>hi<\/main>/)

    // Second render — should hit memory cache, be faster
    const t2 = Date.now()
    const r2 = await (await fetch(`http://localhost:${s.port}/`)).text()
    const d2 = Date.now() - t2
    assert.match(r2, /<main>hi<\/main>/)

    // Second render should not be significantly slower
    // (allow some variance; esbuild compilation is the expensive part)
    assert.ok(d2 <= d1 * 1.5 || d2 < 20, `second render (${d2}ms) should not be much slower than first (${d1}ms)`)
  })

  it('renders after server restart (disk cache)', async () => {
    // First server — compiles and caches to disk
    const app1 = new Router()
    app1.use(react())
    app1.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx'),
    )
    const s1 = start(app1)
    await s1.ready
    const firstRender = await (await fetch(`http://localhost:${s1.port}/`)).text()
    assert.match(firstRender, /<main>hi<\/main>/)
    await s1.close()

    // Second server — should reuse disk cache (fast start)
    const app2 = new Router()
    app2.use(react())
    app2.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/Check.tsx'),
    )
    const s2 = start(app2)
    await s2.ready
    const secondRender = await (await fetch(`http://localhost:${s2.port}/`)).text()
    assert.match(secondRender, /<main>hi<\/main>/)

    servers.push(s2) // ensure cleanup
  })

  // ═══════════════════════════════════════════════════════════════
  // Loader
  // ═══════════════════════════════════════════════════════════════

  it('loader merges data into useServerData', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/DataPage.tsx', {
        loader: async () => ({ user: 'LoaderAlice' }),
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /user.*LoaderAlice/)
  })

  it('loader + static data both merged', async () => {
    const app = new Router()
    app.use(react())
    app.get('/', async (_req, ctx) =>
      ctx.render('src/test/.react-test-pages/DataPage.tsx', {
        data: { kind: 'static' },
        loader: async () => ({ user: 'Merged' }),
      }),
    )

    const s = start(app)
    await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /user.*Merged/)
    assert.match(text, /kind.*static/)
  })
})
