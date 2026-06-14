import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createTestServer } from '../serve.ts'

void describe('serve lifecycle', () => {
  void describe('createTestServer', () => {
    it('creates a test server and responds', async () => {
      const { server, url } = await createTestServer(() => new Response('hello'))
      assert.ok(url)
      assert.ok(server.port > 0)

      const res = await fetch(url)
      assert.equal(res.status, 200)
      assert.equal(await res.text(), 'hello')

      await server.stop()
    })

    it('supports port 0 for random port', async () => {
      const { server } = await createTestServer(() => new Response('ok'), { port: 0 })
      assert.ok(server.port > 0)
      await server.stop()
    })
  })

  void describe('server.stop()', () => {
    it('is idempotent — calling stop() twice does not error', async () => {
      const { server } = await createTestServer(() => new Response('ok'))
      await server.stop()
      await server.stop()
    })
  })

  void describe('server options', () => {
    it('respects maxBodySize and parses body', async () => {
      const { server, url } = await createTestServer(
        async (req) => {
          const text = await req.text()
          return new Response(`got ${text.length} bytes`)
        },
        { maxBodySize: 100 },
      )

      const res = await fetch(url, {
        method: 'POST',
        body: 'small body',
        headers: { 'content-type': 'text/plain' },
      })
      assert.equal(res.status, 200)
      assert.equal(await res.text(), 'got 10 bytes')

      await server.stop()
    })

    it('rejects oversized body with 413', async () => {
      const { server, url } = await createTestServer(async () => new Response('ok'), {
        maxBodySize: 10,
      })

      const res = await fetch(url, {
        method: 'POST',
        body: 'this body is way too long',
        headers: { 'content-type': 'text/plain' },
      })
      assert.equal(res.status, 413)

      await server.stop()
    })
  })
})
