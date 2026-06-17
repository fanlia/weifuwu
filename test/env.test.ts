import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../router.ts'
import { isDev, isProd, getPublicEnv, env } from '../env.ts'

describe('isDev', () => {
  it('returns true when NODE_ENV is development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    assert.equal(isDev(), true)
    process.env.NODE_ENV = prev
  })

  it('returns false when NODE_ENV is production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    assert.equal(isDev(), false)
    process.env.NODE_ENV = prev
  })

  it('returns true when NODE_ENV is not set (dev is default)', () => {
    const prev = process.env.NODE_ENV
    delete process.env.NODE_ENV
    assert.equal(isDev(), true)
    process.env.NODE_ENV = prev
  })
})

describe('isProd', () => {
  it('returns true when NODE_ENV is production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    assert.equal(isProd(), true)
    process.env.NODE_ENV = prev
  })

  it('returns false when NODE_ENV is development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    assert.equal(isProd(), false)
    process.env.NODE_ENV = prev
  })

  it('returns false when NODE_ENV is not set', () => {
    const prev = process.env.NODE_ENV
    delete process.env.NODE_ENV
    assert.equal(isProd(), false)
    process.env.NODE_ENV = prev
  })

  it('isDev and isProd are not opposites', () => {
    // When NODE_ENV is unset, dev is the default
    const prev = process.env.NODE_ENV
    delete process.env.NODE_ENV
    assert.equal(isDev(), true)
    assert.equal(isProd(), false)
    process.env.NODE_ENV = prev
  })
})

describe('loadEnv', () => {
  const tmpDir = resolve(tmpdir(), 'wfw-env-test-' + Date.now())

  before(async () => {
    await mkdir(tmpDir, { recursive: true })
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('loads KEY=VALUE pairs', async () => {
    const envPath = resolve(tmpDir, '.env')
    await writeFile(envPath, 'FOO=bar\nBAZ=123\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.FOO
    delete process.env.BAZ
    loadEnv(envPath)

    assert.equal(process.env.FOO, 'bar')
    assert.equal(process.env.BAZ, '123')
  })

  it('skips comments and blank lines', async () => {
    const envPath = resolve(tmpDir, '.env.comments')
    await writeFile(envPath, '# comment\n\nKEY=val\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.KEY
    loadEnv(envPath)

    assert.equal(process.env.KEY, 'val')
  })

  it('parses quoted values', async () => {
    const envPath = resolve(tmpDir, '.env.quoted')
    await writeFile(envPath, 'MSG="hello world"\nCODE=\'abc\'\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.MSG
    delete process.env.CODE
    loadEnv(envPath)

    assert.equal(process.env.MSG, 'hello world')
    assert.equal(process.env.CODE, 'abc')
  })

  it('trims inline comments', async () => {
    const envPath = resolve(tmpDir, '.env.inline')
    await writeFile(envPath, 'HOST=localhost # development\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.HOST
    loadEnv(envPath)

    assert.equal(process.env.HOST, 'localhost')
  })

  it('does not override existing process.env', async () => {
    const envPath = resolve(tmpDir, '.env.nooverride')
    await writeFile(envPath, 'PATH=/danger\n')
    const { loadEnv } = await import('../env.ts')

    const orig = process.env.PATH
    loadEnv(envPath)

    assert.equal(process.env.PATH, orig)
  })

  it('silently handles missing file', async () => {
    const { loadEnv } = await import('../env.ts')
    loadEnv(resolve(tmpDir, '.env.nonexistent'))
  })

  it('skips lines without equals sign', async () => {
    const envPath = resolve(tmpDir, '.env.nolineqn')
    await writeFile(envPath, 'JUSTAVALUE\nKEY=val\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.KEY
    loadEnv(envPath)

    assert.equal(process.env.KEY, 'val')
    assert.equal(process.env.JUSTAVALUE, undefined, 'line without = should be skipped')
  })

  it('skips lines with empty key', async () => {
    const envPath = resolve(tmpDir, '.env.emptykey')
    await writeFile(envPath, '=value\nKEY=val\n')
    const { loadEnv } = await import('../env.ts')

    delete process.env.KEY
    loadEnv(envPath)

    assert.equal(process.env.KEY, 'val')
    assert.equal(process.env[''], undefined, 'line with empty key should be skipped')
  })
})

describe('getPublicEnv', () => {
  it('returns only WEIFUWU_PUBLIC_* vars with prefix stripped', () => {
    const prev = {
      api: process.env.WEIFUWU_PUBLIC_API_URL,
      name: process.env.WEIFUWU_PUBLIC_APP_NAME,
      secret: process.env.SECRET_KEY,
    }
    process.env.WEIFUWU_PUBLIC_API_URL = 'https://api.example.com'
    process.env.WEIFUWU_PUBLIC_APP_NAME = 'my-app'
    process.env.SECRET_KEY = 'dont-leak'

    const result = getPublicEnv()
    assert.equal(result.API_URL, 'https://api.example.com')
    assert.equal(result.APP_NAME, 'my-app')
    assert.equal(result.SECRET_KEY, undefined, 'non-prefixed vars should be excluded')

    process.env.WEIFUWU_PUBLIC_API_URL = prev.api
    process.env.WEIFUWU_PUBLIC_APP_NAME = prev.name
    process.env.SECRET_KEY = prev.secret
  })

  it('returns empty object when no public vars', () => {
    // Save all WEIFUWU_PUBLIC_* vars
    const saved: Record<string, string | undefined> = {}
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('WEIFUWU_PUBLIC_')) {
        saved[key] = process.env[key]
        delete process.env[key]
      }
    }
    const result = getPublicEnv()
    assert.deepEqual(result, {})
    // Restore
    for (const [key, val] of Object.entries(saved)) {
      if (val !== undefined) process.env[key] = val
    }
  })
})

describe('env() middleware', () => {
  it('injects ctx.env with public vars', async () => {
    const prev = process.env.WEIFUWU_PUBLIC_MODE
    process.env.WEIFUWU_PUBLIC_MODE = 'test'

    const r = new Router()
    r.use(env())
    r.get('/', (_req, ctx) => {
      assert.deepEqual(ctx.env?.MODE, 'test')
      return Response.json({ ok: true })
    })
    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)

    if (prev !== undefined) process.env.WEIFUWU_PUBLIC_MODE = prev
    else delete process.env.WEIFUWU_PUBLIC_MODE
  })

  it('ctx.env is immutable within a request', async () => {
    const r = new Router()
    r.use(env())
    r.get('/', (_req, ctx) => {
      // Same reference every time
      const e1 = ctx.env
      const e2 = ctx.env
      assert.equal(e1, e2)
      return Response.json({ ok: true })
    })
    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })
})
