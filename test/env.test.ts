import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

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
})
