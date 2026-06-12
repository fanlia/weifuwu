import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import type { Router } from '../router.ts'

const templateDir = './cli/template'

describe('cli/template structure', () => {
  const files = ['app.ts', 'index.ts', 'ui/app/layout.tsx', 'ui/app/page.tsx', 'ui/app/globals.css', 'ui/components/Greeting.tsx', 'locales/en.json', 'locales/zh.json', 'locales/zh-CN.json', 'locales/zh-TW.json']
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
    const { clearCompileCache } = await import('../compile.ts')
    clearCompileCache()
    execSync('rm -rf .weifuwu', { cwd: resolve(templateDir) })

    process.chdir(resolve(templateDir))
    const m = await import('../cli/template/app.ts')
    process.chdir(origCwd)
    app = m.app
  })

  it('GET / returns 200 with SSR HTML', async () => {
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<html/)
    assert.match(html, /Weifuwu|Build Faster/)
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
    assert.match(js, /(createRoot|hydrateRoot)/)
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

  it('injects tailwind CSS link with hash', async () => {
    const res = await app.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
    )
    const html = await res.text()
    const match = html.match(/href="(\/__wfw\/style\/[a-f0-9]+\.css)"/)
    assert.ok(match, 'expected CSS link with hash in HTML')
    assert.ok(match[1].length > 20, 'expected hash to be present')

    const cssRes = await app.handler()(
      new Request(`http://localhost${match[1]}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(cssRes.status, 200)
    assert.match(cssRes.headers.get('content-type') || '', /text\/css/)
    const css = await cssRes.text()
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
      'ui/app/layout.tsx', 'ui/app/page.tsx', 'ui/app/globals.css', 'ui/components/Greeting.tsx',
      'locales/en.json', 'locales/zh.json', 'locales/zh-CN.json', 'locales/zh-TW.json',
    ]
    for (const f of expected) {
      assert.ok(existsSync(join(dir, f)), `missing ${f}`)
    }
  })

  it('generates correct package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(tmpDir, 'test-app', 'package.json'), 'utf-8'))
    assert.equal(pkg.name, 'test-app')
    assert.ok(pkg.scripts.dev.includes('node --watch'))
    assert.equal(pkg.scripts.start, 'node index.ts')
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

describe('compile cache', () => {
  it('shares cache between relative and absolute paths', async () => {
    const { compileTsx, compileTsxDev, clearCompileCache } = await import('../compile.ts')
    const { resolve } = await import('node:path')

    clearCompileCache()
    const tsxPath = './cli/template/ui/app/page.tsx'
    const absPath = resolve(tsxPath)

    // Simulate watcher (absolute path)
    const mod1 = await compileTsxDev(absPath)

    // Simulate ssr() (relative path) — should hit same cache
    const mod2 = await compileTsx(tsxPath)

    assert.ok(mod1?.default)
    assert.strictEqual(mod1, mod2, 'should return same cached module')
  })
})

describe('ssr()', () => {
  const origEnv = process.env.NODE_ENV

  before(() => { process.env.NODE_ENV = 'development' })
  after(() => { process.env.NODE_ENV = origEnv })

  it('registers WS route at /__weifuwu/livereload in dev', async () => {
    const { Router: R } = await import('../router.ts')
    const { ssr } = await import('../ssr.ts')
    const app = new R()
    const r = ssr({ dir: './cli/template/ui' })
    app.use('/', r)
    const wsHandler = app.websocketHandler()
    assert.equal(typeof wsHandler, 'function')
    if (typeof (r as any).close === 'function') (r as any).close()
  })
})
