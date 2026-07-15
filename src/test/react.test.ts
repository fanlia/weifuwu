import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'
import { react } from '../react/index.ts'
import type { Server } from '../core/serve.ts'

const UI_DIR = resolve(process.cwd(), 'src/test/.react-test-ui')

describe('react SSR — directory mode', () => {
  let servers: Server[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  async function setupUI(dir: string) {
    await mkdir(resolve(dir, 'about'), { recursive: true })
    await mkdir(resolve(dir, 'blog'), { recursive: true })
    await mkdir(resolve(dir, 'blog', '[slug]'), { recursive: true })
    await mkdir(resolve(dir, '(marketing)'), { recursive: true })

    await writeFile(resolve(dir, 'layout.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export default function RootLayout({ children }: { children: any }) {
        return <><header>Root</header><main>{children}</main><footer>Root</footer></>
      }
    `)
    await writeFile(resolve(dir, 'page.tsx'), `
      export default function Home() { return <h1>Home</h1> }
    `)
    await writeFile(resolve(dir, 'about', 'page.tsx'), `
      export default function About() { return <h1>About</h1> }
    `)
    await writeFile(resolve(dir, 'blog', 'layout.tsx'), `
      export default function BlogLayout({ children }: { children: any }) {
        return <><nav>Blog</nav>{children}</>
      }
    `)
    await writeFile(resolve(dir, 'blog', 'page.tsx'), `
      export default function Blog() { return <h1>Blog</h1> }
    `)
    await writeFile(resolve(dir, 'blog', '[slug]', 'page.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export async function loader(ctx: any) { return { slug: ctx.params.slug } }
      export default function Post() { const d = useServerData(); return <h1>Post: {d.slug}</h1> }
    `)
    await writeFile(resolve(dir, '(marketing)', 'page.tsx'), `
      export default function M() { return <h1>Marketing</h1> }
    `)
    await writeFile(resolve(dir, 'not-found.tsx'), `
      export default function NF() { return <h1>404</h1> }
    `)
  }

  before(async () => {
    await rm(UI_DIR, { recursive: true, force: true })
    await setupUI(UI_DIR)
  })

  after(async () => {
    await rm(UI_DIR, { recursive: true, force: true })
  })

  function start(app: Router): Server {
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  function catchAll(app: Router, dir: string) {
    app.get('/*', async (req, ctx) => ctx.render(dir))
  }

  it('renders root /', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /<h1>Home/)
  })

  it('renders /about', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    assert.match(await (await fetch(`http://localhost:${s.port}/about`)).text(), /<h1>About/)
  })

  it('renders /blog with nested layout', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/blog`)).text()
    assert.match(text, /<h1>Blog/)
    assert.match(text, /<nav>Blog/)
    assert.match(text, /<header>Root/)
  })

  it('renders dynamic /blog/:slug', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    assert.match(await (await fetch(`http://localhost:${s.port}/blog/hello`)).text(), /Post:.*hello/)
  })

  it('uses not-found.tsx for 404', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    assert.match(await (await fetch(`http://localhost:${s.port}/x`)).text(), /<h1>404/)
  })

  it('returns 404 when no not-found.tsx', async () => {
    const d = resolve(process.cwd(), 'src/test/.react-no404')
    await mkdir(d, { recursive: true })
    await writeFile(resolve(d, 'page.tsx'), `export default function T() { return <h1>T</h1> }`)
    const app = new Router(); app.use(react()); catchAll(app, d)
    const s = start(app); await s.ready
    assert.equal((await fetch(`http://localhost:${s.port}/x`)).status, 404)
    await rm(d, { recursive: true, force: true })
  })

  it('coexists with API routes', async () => {
    const app = new Router(); app.use(react())
    app.get('/api/ok', () => Response.json({ ok: true }))
    catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    assert.deepEqual(await (await fetch(`http://localhost:${s.port}/api/ok`)).json(), { ok: true })
    assert.match(await (await fetch(`http://localhost:${s.port}/about`)).text(), /<h1>About/)
  })

  it('produces valid HTML', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    const text = await (await fetch(`http://localhost:${s.port}/`)).text()
    assert.match(text, /^<!DOCTYPE html>/)
    assert.match(text, /<html/)
    assert.match(text, /<div id="root">/)
  })

  it('loader receives URL params', async () => {
    const app = new Router(); app.use(react()); catchAll(app, UI_DIR)
    const s = start(app); await s.ready
    assert.match(await (await fetch(`http://localhost:${s.port}/blog/my-post`)).text(), /Post:.*my-post/)
  })

  it('handles multiple dynamic params', async () => {
    const d = resolve(process.cwd(), 'src/test/.react-deep')
    await mkdir(resolve(d, 'users', '[uid]', 'posts', '[pid]'), { recursive: true })
    await writeFile(resolve(d, 'users', '[uid]', 'posts', '[pid]', 'page.tsx'), `
      import { useServerData } from 'weifuwu/react'
      export async function loader(ctx: any) { return { uid: ctx.params.uid, pid: ctx.params.pid } }
      export default function P() { const d = useServerData(); return <h1>{d.uid}/{d.pid}</h1> }
    `)
    const app = new Router(); app.use(react()); catchAll(app, d)
    const s = start(app); await s.ready
    assert.match(await (await fetch(`http://localhost:${s.port}/users/alice/posts/42`)).text(), /alice/)
    await rm(d, { recursive: true, force: true })
  })
})
