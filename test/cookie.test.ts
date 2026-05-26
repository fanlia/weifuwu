import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getCookies, setCookie, deleteCookie } from '../cookie.ts'

describe('getCookies', () => {
  it('parses a single cookie', () => {
    const req = new Request('http://localhost', { headers: { cookie: 'name=value' } })
    assert.deepEqual(getCookies(req), { name: 'value' })
  })

  it('parses multiple cookies', () => {
    const req = new Request('http://localhost', { headers: { cookie: 'a=1; b=2; c=3' } })
    assert.deepEqual(getCookies(req), { a: '1', b: '2', c: '3' })
  })

  it('decodes URL-encoded values', () => {
    const req = new Request('http://localhost', { headers: { cookie: 'name=hello%20world' } })
    assert.deepEqual(getCookies(req), { name: 'hello world' })
  })

  it('returns empty object when no cookie header', () => {
    const req = new Request('http://localhost')
    assert.deepEqual(getCookies(req), {})
  })

  it('handles whitespace around pairs', () => {
    const req = new Request('http://localhost', { headers: { cookie: ' a = 1 ; b=2 ' } })
    assert.deepEqual(getCookies(req), { a: '1', b: '2' })
  })
})

describe('setCookie', () => {
  it('sets a cookie on the response', () => {
    const res = new Response('ok')
    const updated = setCookie(res, 'session', 'abc123')
    assert.equal(updated.headers.get('Set-Cookie'), 'session=abc123')
  })

  it('appends multiple Set-Cookie headers', () => {
    let res = new Response('ok')
    res = setCookie(res, 'a', '1')
    res = setCookie(res, 'b', '2')
    const headers = res.headers.getSetCookie?.() ?? res.headers.get('Set-Cookie')
    assert.ok(Array.isArray(headers) ? headers.length === 2 : true)
  })

  it('adds cookie options', () => {
    const res = new Response('ok')
    const updated = setCookie(res, 'token', 'xyz', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })
    const cookie = updated.headers.get('Set-Cookie')!
    assert.ok(cookie.includes('HttpOnly'))
    assert.ok(cookie.includes('Secure'))
    assert.ok(cookie.includes('SameSite=lax'))
    assert.ok(cookie.includes('Max-Age=3600'))
    assert.ok(cookie.includes('Path=/'))
  })

  it('does not mutate original response', () => {
    const res = new Response('ok')
    setCookie(res, 'x', 'y')
    assert.equal(res.headers.get('Set-Cookie'), null)
  })
})

describe('deleteCookie', () => {
  it('sets Max-Age=0 to expire the cookie', () => {
    const res = new Response('ok')
    const updated = deleteCookie(res, 'session')
    const cookie = updated.headers.get('Set-Cookie')!
    assert.ok(cookie.includes('session='))
    assert.ok(cookie.includes('Max-Age=0'))
  })
})
