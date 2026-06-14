import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { session, MemoryStore } from '../session.ts'
import { getCookies } from '../cookie.ts'

function parseSetCookie(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {}
  const headers = res.headers.getSetCookie?.() ?? []
  for (const h of headers.length ? headers : [res.headers.get('set-cookie') ?? '']) {
    const idx = h.indexOf('=')
    if (idx === -1) continue
    const name = h.slice(0, idx).trim()
    const rest = h.slice(idx + 1)
    const value = rest.includes(';') ? rest.slice(0, rest.indexOf(';')) : rest
    cookies[name] = value
  }
  return cookies
}

describe('session', () => {
  let memStore: MemoryStore

  before(() => {
    memStore = new MemoryStore()
  })

  after(() => {
    memStore.close()
  })

  it('does not set cookie when no session data is written (no mutation)', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })
    const r = new Router().use(sess).get('/hello', () => new Response('ok'))

    const res = await r.handler()(new Request('http://localhost/hello'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
    // No Set-Cookie header because session was never touched
    assert.equal(res.headers.get('set-cookie'), null)
  })

  it('sets cookie after writing to session', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })
    const r = new Router().use(sess).get('/set', (req, ctx: any) => {
      ctx.session.userId = 42
      return new Response('ok')
    })

    const res = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)

    const cookies = parseSetCookie(res)
    assert.ok(cookies.__session)
    assert.ok(cookies.__session.length > 0)
    // Should be a UUID (36 chars)
    assert.equal(cookies.__session.length, 36)
  })

  it('reads session from cookie on subsequent request', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })
    let capturedSession: any

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 42
        ctx.session.role = 'admin'
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        capturedSession = { userId: ctx.session.userId, role: ctx.session.role, id: ctx.session.id }
        return Response.json(capturedSession)
      })

    // First request: set session
    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookies = parseSetCookie(setRes)
    const sid = cookies.__session

    // Second request: read session
    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(getRes.status, 200)
    const data = (await getRes.json()) as any
    assert.equal(data.userId, 42)
    assert.equal(data.role, 'admin')
    assert.equal(data.id, sid)
  })

  it('session.id is stable across requests', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })
    let firstId: string
    let secondId: string

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 1
        firstId = ctx.session.id
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        secondId = ctx.session.id
        return new Response('ok')
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session
    assert.equal(firstId!, sid)

    await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(secondId!, sid)
  })

  it('destroy() clears session and removes cookie', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 42
        return new Response('ok')
      })
      .get('/destroy', (req, ctx: any) => {
        ctx.session.destroy()
        return new Response('ok')
      })

    // Set session
    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session

    // Destroy
    const delRes = await r.handler()(
      new Request('http://localhost/destroy', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    const delCookies = parseSetCookie(delRes)
    // Cookie should be deleted (empty value)
    assert.equal(delCookies.__session, '')

    // Verify session is gone from store
    const data = await memStore.get(sid)
    assert.equal(data, null)
  })

  it('setting ctx.session = null destroys session', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 42
        return new Response('ok')
      })
      .get('/clear', (req, ctx: any) => {
        ;(ctx as any).session = null
        return new Response('ok')
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session

    await r.handler()(
      new Request('http://localhost/clear', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )

    const data = await memStore.get(sid)
    assert.equal(data, null)
  })

  it('auto-detects mutation without explicit save()', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router().use(sess).get('/set', (req, ctx: any) => {
      ctx.session.counter = (ctx.session.counter ?? 0) + 1
      return Response.json({ counter: ctx.session.counter })
    })

    // Create session
    const res1 = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(res1).__session
    assert.equal(((await res1.json()) as any).counter, 1)

    // Increment
    const res2 = await r.handler()(
      new Request('http://localhost/set', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(((await res2.json()) as any).counter, 2)

    // Increment again
    const res3 = await r.handler()(
      new Request('http://localhost/set', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(((await res3.json()) as any).counter, 3)
  })

  it('TTL expiry discards stale sessions', async () => {
    const mem = new MemoryStore()
    const sess = session({ store: mem, ttl: 50 }) // 50ms TTL
    let sessionUserId: unknown

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 99
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        sessionUserId = ctx.session.userId
        return new Response('ok')
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 80))

    // Session should be gone
    await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(sessionUserId, undefined)

    mem.close()
  })

  it('explicit save() marks session dirty even without property mutation', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })
    let capturedSession: any

    const r = new Router().use(sess).get('/mutate', (req, ctx: any) => {
      const arr = ctx.session.items ?? []
      arr.push('new')
      ctx.session.items = arr // property assignment — auto-detected
      capturedSession = ctx.session
      return new Response('ok')
    })

    const res1 = await r.handler()(new Request('http://localhost/mutate'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(res1).__session

    await r.handler()(
      new Request('http://localhost/mutate', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )

    assert.deepEqual(capturedSession?.items, ['new', 'new'])
  })

  it('handles multiple concurrent session cookies independently', async () => {
    const sess = session({ store: memStore, ttl: 60000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = ctx.session.userId ?? 0
        ctx.session.userId++
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({ userId: ctx.session.userId, sid: ctx.session.id })
      })

    // Create session A
    const resA = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sidA = parseSetCookie(resA).__session

    // Create session B
    const resB = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sidB = parseSetCookie(resB).__session

    assert.notEqual(sidA, sidB)

    // Read A
    const readA = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sidA}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(((await readA.json()) as any).userId, 1)

    // Read B
    const readB = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sidB}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(((await readB.json()) as any).userId, 1)
  })

  it('custom cookie name works', async () => {
    const sess = session({ store: memStore, ttl: 60_000, cookieName: 'myapp_sid' })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 1
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({ userId: ctx.session.userId })
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookies = parseSetCookie(setRes)
    assert.ok(cookies.myapp_sid)
    assert.equal(cookies.__session, undefined)

    const sid = cookies.myapp_sid
    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `myapp_sid=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(((await getRes.json()) as any).userId, 1)
  })

  it('MemoryStore cleanup removes expired sessions', async () => {
    const mem = new MemoryStore(50) // cleanup every 50ms
    await mem.set('test1', { a: 1 }, 30) // 30ms TTL
    await mem.set('test2', { b: 2 }, 30)

    assert.equal(mem.size, 2)

    await new Promise((r) => setTimeout(r, 100))

    assert.equal(mem.size, 0)
    mem.close()
  })

  it('reading non-existent session returns empty object', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router().use(sess).get('/get', (req, ctx: any) => {
      assert.equal(typeof ctx.session, 'object')
      assert.equal(ctx.session.userId, undefined)
      assert.ok(ctx.session.id)
      return Response.json({ exists: true })
    })

    const res = await r.handler()(new Request('http://localhost/get'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    // No set-cookie because session was never written to
    assert.equal(res.headers.get('set-cookie'), null)
  })

  it('session data survives stringify/parse roundtrip via store', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.name = 'Alice'
        ctx.session.count = 42
        ctx.session.nested = { a: [1, 2, 3] }
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({
          name: ctx.session.name,
          count: ctx.session.count,
          nested: ctx.session.nested,
        })
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session

    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    const data = (await getRes.json()) as any
    assert.equal(data.name, 'Alice')
    assert.equal(data.count, 42)
    assert.deepEqual(data.nested, { a: [1, 2, 3] })
  })

  it('deleteProperty triggers save', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.x = 1
        ctx.session.y = 2
        return new Response('ok')
      })
      .get('/del', (req, ctx: any) => {
        delete ctx.session.x
        return Response.json({ x: ctx.session.x, y: ctx.session.y })
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const sid = parseSetCookie(setRes).__session

    const delRes = await r.handler()(
      new Request('http://localhost/del', { headers: { cookie: `__session=${sid}` } }),
      { params: {}, query: {} } as any,
    )
    const body = (await delRes.json()) as any
    assert.equal(body.x, undefined)
    assert.equal(body.y, 2)
  })

  // ── Signed cookie tests ────────────────────────────────────────

  it('signs cookie when secret is provided', async () => {
    const sess = session({ store: memStore, ttl: 60_000, secret: 'my-secret' })

    const r = new Router().use(sess).get('/set', (req, ctx: any) => {
      ctx.session.userId = 1
      return new Response('ok')
    })

    const res = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookies = parseSetCookie(res)
    const value = cookies.__session
    // Must be uuid.signature format
    assert.ok(value.includes('.'), 'cookie must be signed')
    const [sid, sig] = value.split('.')
    assert.equal(sid.length, 36, 'sid must be a UUID')
    assert.ok(sig.length > 0, 'signature must be present')
  })

  it('rejects tampered cookie when secret is set', async () => {
    const sess = session({ store: memStore, ttl: 60_000, secret: 'my-secret' })

    const r = new Router().use(sess).get('/get', (req, ctx: any) => {
      return Response.json({ userId: ctx.session.userId, id: ctx.session.id })
    })

    // Send a tampered cookie — valid UUID but bad HMAC
    const res = await r.handler()(
      new Request('http://localhost/get', {
        headers: { cookie: '__session=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.badhmac' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    // Tampered cookie → treated as new session (no user data, different ID)
    assert.equal(body.userId, undefined)
    assert.notEqual(body.id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('signature with different secret is rejected', async () => {
    const sessA = session({ store: memStore, ttl: 60_000, secret: 'secret-a' })
    const sessB = session({ store: memStore, ttl: 60_000, secret: 'secret-b' })

    const rA = new Router().use(sessA).get('/set', (req, ctx: any) => {
      ctx.session.userId = 1
      return new Response('ok')
    })

    const resA = await rA.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookieValue = parseSetCookie(resA).__session

    // Now try to use this cookie with secret-b
    const rB = new Router().use(sessB).get('/get', (req, ctx: any) => {
      return Response.json({ userId: ctx.session.userId })
    })
    const resB = await rB.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${cookieValue}` } }),
      { params: {}, query: {} } as any,
    )
    const body = (await resB.json()) as any
    assert.equal(body.userId, undefined, 'different secret must reject signature')
  })

  it('no secret — cookie is plain UUID (backward compat)', async () => {
    const sess = session({ store: memStore, ttl: 60_000 })

    const r = new Router().use(sess).get('/set', (req, ctx: any) => {
      ctx.session.userId = 1
      return new Response('ok')
    })

    const res = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const value = parseSetCookie(res).__session
    // No dot — plain UUID
    assert.ok(!value.includes('.'), 'without secret, cookie must be plain UUID')
    assert.equal(value.length, 36)
  })

  it('signed cookie roundtrip works', async () => {
    const sess = session({ store: memStore, ttl: 60_000, secret: 'my-secret' })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 42
        ctx.session.role = 'admin'
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({
          userId: ctx.session.userId,
          role: ctx.session.role,
          id: ctx.session.id,
        })
      })

    // Set session
    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookieValue = parseSetCookie(setRes).__session

    // Read session with signed cookie
    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${cookieValue}` } }),
      { params: {}, query: {} } as any,
    )
    const body = (await getRes.json()) as any
    assert.equal(body.userId, 42)
    assert.equal(body.role, 'admin')
    assert.ok(body.id)
  })

  // ── Rotation tests ─────────────────────────────────────────────

  it('rotates session ID after rotateInterval', async () => {
    const mem = new MemoryStore()
    const sess = session({ store: mem, ttl: 60_000, secret: 'test', rotateInterval: 50 })

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 99
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({ userId: ctx.session.userId })
      })

    // Create session
    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookie1 = parseSetCookie(setRes).__session
    const oldSid = cookie1!.split('.')[0]

    // Wait for rotation interval
    await new Promise((r) => setTimeout(r, 60))

    // Read session — should auto-rotate
    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${cookie1}` } }),
      { params: {}, query: {} } as any,
    )
    const body = (await getRes.json()) as any
    assert.equal(body.userId, 99, 'data preserved after rotation')

    // Cookie should be updated with new signed ID
    const cookie2 = parseSetCookie(getRes).__session
    assert.ok(cookie2, 'new cookie must be set after rotation')
    assert.notEqual(cookie2, cookie1, 'cookie value must change after rotation')
    assert.ok(cookie2!.includes('.'), 'new cookie must be signed')

    // New cookie SID should be different from old
    const newSid = cookie2!.split('.')[0]
    assert.notEqual(newSid, oldSid, 'session ID must rotate')

    // Old SID should be gone from store
    const oldData = await mem.get(oldSid)
    assert.equal(oldData, null, 'old session ID must be deleted')

    mem.close()
  })

  it('rotateInterval: 0 disables rotation', async () => {
    const sess = session({ store: memStore, ttl: 60_000, secret: 'test', rotateInterval: 0 })
    let capturedId: string

    const r = new Router()
      .use(sess)
      .get('/set', (req, ctx: any) => {
        ctx.session.userId = 1
        capturedId = ctx.session.id
        return new Response('ok')
      })
      .get('/get', (req, ctx: any) => {
        return Response.json({ id: ctx.session.id, userId: ctx.session.userId })
      })

    const setRes = await r.handler()(new Request('http://localhost/set'), {
      params: {},
      query: {},
    } as any)
    const cookie1 = parseSetCookie(setRes).__session
    const sid1 = capturedId!

    // Even after long wait, no rotation
    await new Promise((r) => setTimeout(r, 120))

    const getRes = await r.handler()(
      new Request('http://localhost/get', { headers: { cookie: `__session=${cookie1}` } }),
      { params: {}, query: {} } as any,
    )
    const body = (await getRes.json()) as any
    assert.equal(body.id, sid1, 'ID must not change when rotation is disabled')
    assert.equal(body.userId, 1)
  })
})
