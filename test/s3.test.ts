import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { s3 } from '../s3.ts'
import { Router } from '../router.ts'
import { CreateBucketCommand } from '@aws-sdk/client-s3'

// ── Test configuration ──────────────────────────────────────────────────────

const TEST_S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000'
const TEST_S3_BUCKET = process.env.TEST_S3_BUCKET ?? 'weifuwu-test'
const TEST_S3_ACCESS_KEY = process.env.TEST_S3_ACCESS_KEY ?? 'minioadmin'
const TEST_S3_SECRET_KEY = process.env.TEST_S3_SECRET_KEY ?? 'minioadmin'

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomKey(prefix = 'test'): string {
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('s3', { skip: process.env.TEST_S3_SKIP }, () => {
  let storage: ReturnType<typeof s3>
  let bucketReady: Promise<void>

  before(async () => {
    storage = s3({
      bucket: TEST_S3_BUCKET,
      endpoint: TEST_S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: TEST_S3_ACCESS_KEY,
        secretAccessKey: TEST_S3_SECRET_KEY,
      },
    })

    // Ensure the test bucket exists
    bucketReady = (async () => {
      try {
        await storage.client.send(new CreateBucketCommand({ Bucket: TEST_S3_BUCKET }))
      } catch (err: any) {
        // BucketAlreadyExists / BucketAlreadyOwnedByYou is fine
        if (err.name !== 'BucketAlreadyExists' && err.name !== 'BucketAlreadyOwnedByYou') {
          throw err
        }
      }
    })()
    await bucketReady
  })

  // ── Module shape ──────────────────────────────────────────────

  it('returns all expected methods', () => {
    assert.equal(typeof storage.put, 'function')
    assert.equal(typeof storage.get, 'function')
    assert.equal(typeof storage.delete, 'function')
    assert.equal(typeof storage.exists, 'function')
    assert.equal(typeof storage.url, 'function')
    assert.equal(typeof storage.list, 'function')
    assert.ok(storage.client)
  })

  // ── Put + Get ─────────────────────────────────────────────────

  it('put and get a text object', async () => {
    const key = randomKey()
    await storage.put(key, 'hello s3', { contentType: 'text/plain' })
    const data = await storage.get(key)
    assert.ok(data)
    assert.equal(data!.toString(), 'hello s3')
  })

  it('put and get a Buffer', async () => {
    const key = randomKey()
    const buf = Buffer.from([0, 1, 2, 3, 255])
    await storage.put(key, buf, { contentType: 'application/octet-stream' })
    const data = await storage.get(key)
    assert.ok(data)
    assert.deepEqual([...data!], [0, 1, 2, 3, 255])
  })

  // ── Get non-existent ──────────────────────────────────────────

  it('get returns null for non-existent key', async () => {
    const data = await storage.get(`nonexistent/${Date.now()}`)
    assert.equal(data, null)
  })

  // ── Exists ────────────────────────────────────────────────────

  it('exists returns true for existing object', async () => {
    const key = randomKey()
    await storage.put(key, 'exists check')
    assert.equal(await storage.exists(key), true)
  })

  it('exists returns false for non-existent object', async () => {
    assert.equal(await storage.exists(`nonexistent/${Date.now()}`), false)
  })

  // ── Delete ─────────────────────────────────────────────────────

  it('delete removes an object', async () => {
    const key = randomKey()
    await storage.put(key, 'to delete')
    assert.equal(await storage.exists(key), true)
    await storage.delete(key)
    assert.equal(await storage.exists(key), false)
    assert.equal(await storage.get(key), null)
  })

  it('delete on non-existent key does not throw', async () => {
    await storage.delete(`nonexistent/${Date.now()}`)
  })

  // ── List ───────────────────────────────────────────────────────

  it('list returns objects under a prefix', async () => {
    const prefix = `list-test/${Date.now()}`
    await storage.put(`${prefix}/a.txt`, 'a')
    await storage.put(`${prefix}/b.txt`, 'b')
    await storage.put(`${prefix}/sub/c.txt`, 'c')

    const keys = await storage.list(prefix)
    assert.ok(keys.length >= 3)
    assert.ok(keys.includes(`${prefix}/a.txt`))
    assert.ok(keys.includes(`${prefix}/b.txt`))
    assert.ok(keys.includes(`${prefix}/sub/c.txt`))

    // Cleanup
    for (const k of keys) await storage.delete(k)
  })

  it('list returns empty array for non-existent prefix', async () => {
    const keys = await storage.list(`no-such-prefix-${Date.now()}/`)
    assert.deepEqual(keys, [])
  })

  // ── URL ────────────────────────────────────────────────────────

  it('url generates a signed URL (can be fetched)', async () => {
    const key = randomKey()
    await storage.put(key, 'signed url content', { contentType: 'text/plain' })

    const signedUrl = await storage.url(key, { expiresIn: 3600 })
    assert.ok(signedUrl.startsWith('http'), 'signed URL must be a valid URL')
    assert.ok(signedUrl.includes(key), 'signed URL must contain the object key')

    // The signed URL should be fetchable
    const res = await fetch(signedUrl)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'signed url content')
  })

  it('url with publicUrl returns unsigned public URL', async () => {
    const publicStorage = s3({
      bucket: TEST_S3_BUCKET,
      endpoint: TEST_S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: TEST_S3_ACCESS_KEY,
        secretAccessKey: TEST_S3_SECRET_KEY,
      },
      publicUrl: 'https://cdn.example.com',
    })

    const key = randomKey()
    const publicUrl = await publicStorage.url(key, { expiresIn: 0 })
    assert.equal(publicUrl, `https://cdn.example.com/${key}`)
  })

  it('url with expiresIn=0 throws if no publicUrl configured', async () => {
    const storageNoPublic = s3({
      bucket: TEST_S3_BUCKET,
      endpoint: TEST_S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: TEST_S3_ACCESS_KEY,
        secretAccessKey: TEST_S3_SECRET_KEY,
      },
    })

    await assert.rejects(() => storageNoPublic.url('any-key', { expiresIn: 0 }), /publicUrl/)
  })

  // ── Middleware ─────────────────────────────────────────────────

  it('injects ctx.s3 as middleware', async () => {
    const app = new Router()
    app.use(storage)
    app.get('/check', (req, ctx: any) => {
      assert.ok(ctx.s3)
      assert.equal(typeof ctx.s3.put, 'function')
      assert.equal(typeof ctx.s3.get, 'function')
      return new Response('ok')
    })

    const res = await app.handler()(new Request('http://localhost/check'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
  })
})
