import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import type { Router } from '../router.ts'

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
    execSync('rm -rf .weifuwu', { cwd: resolve(templateDir) })

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

  it('injects tailwind CSS link', async () => {
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    assert.match(html, /\/__wfw\/style\.css/)
  })

  it('serves compiled tailwind CSS', async () => {
    const res = await app.handler()(
      new Request('http://localhost/__wfw/style.css'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') || '', /text\/css/)
    const css = await res.text()
    assert.ok(css.length > 1000, 'expected substantial compiled CSS')
  })
})

describe('weifuwu init', () => {
  const tmpDir = resolve(tmpdir(), 'wfw-init-' + Date.now())
  const cliPath = resolve(import.meta.dirname, '..', 'cli.ts')

  before(() => mkdirSync(tmpDir, { recursive: true }))
  after(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('creates project with all expected files', () => {
    execSync(`node ${cliPath} init test-app`, { cwd: tmpDir })
    const dir = resolve(tmpDir, 'test-app')
    const expected = [
      'package.json', 'tsconfig.json', '.gitignore', '.env', 'AGENTS.md',
      'app.ts', 'index.ts',
      'ui/layout.tsx', 'ui/page.tsx', 'ui/app.css',
    ]
    for (const f of expected) {
      assert.ok(existsSync(join(dir, f)), `missing ${f}`)
    }
  })

  it('generates correct package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(tmpDir, 'test-app', 'package.json'), 'utf-8'))
    assert.equal(pkg.name, 'test-app')
    assert.equal(pkg.scripts.dev, 'node --watch index.ts')
    assert.equal(pkg.scripts.start, 'NODE_ENV=production node index.ts')
  })

  it('generates .gitignore with .weifuwu', () => {
    const g = readFileSync(resolve(tmpDir, 'test-app', '.gitignore'), 'utf-8')
    assert.ok(g.includes('.weifuwu'))
  })

  it('generates AGENTS.md with project name', () => {
    const a = readFileSync(resolve(tmpDir, 'test-app', 'AGENTS.md'), 'utf-8')
    assert.ok(a.includes('test-app'))
  })

  it('fails without project name', () => {
    assert.throws(() => execSync(`node ${cliPath} init`, { cwd: tmpDir }))
  })
})

describe('liveReload()', () => {
  it('registers WS route at /__weifuwu/livereload', async () => {
    const { Router: R } = await import('../router.ts')
    const { liveReload } = await import('../live.ts')
    const app = new R()
    const lr = liveReload({ dirs: ['./cli/template'] })
    app.use(lr)
    const wsHandler = app.websocketHandler()
    assert.equal(typeof wsHandler, 'function')
    lr.close()
  })
})
