import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('stream', () => {
  it('readStream converts ReadableStream to string', async () => {
    const { readStream } = await import('../stream.ts')
    const data = 'hello world'
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(data))
        ctrl.close()
      },
    })
    const result = await readStream(stream)
    assert.equal(result, data)
  })

  it('readStream handles multiple chunks', async () => {
    const { readStream } = await import('../stream.ts')
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('part1'))
        ctrl.enqueue(new TextEncoder().encode('part2'))
        ctrl.close()
      },
    })
    const result = await readStream(stream)
    assert.equal(result, 'part1part2')
  })

  it('readStream handles empty stream', async () => {
    const { readStream } = await import('../stream.ts')
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.close()
      },
    })
    const result = await readStream(stream)
    assert.equal(result, '')
  })

  it('streamResponse returns 200 HTML response by default', async () => {
    const { streamResponse } = await import('../stream.ts')
    const html = '<!DOCTYPE html><html><head></head><body><div id="__weifuwu_root"></div></body></html>'
    const reactStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(html))
        ctrl.close()
      },
    })
    const res = streamResponse(reactStream, {
      ctx: { params: {}, query: {}, prefs: {} } as any,
      base: '',
      isDev: false,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
  })

  it('streamResponse injects WEIFUWU_CTX script', async () => {
    const { readStream, streamResponse } = await import('../stream.ts')
    const html = '<!DOCTYPE html><html><head></head><body><div id="__weifuwu_root"></div></body></html>'
    const reactStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(html))
        ctrl.close()
      },
    })
    const res = streamResponse(reactStream, {
      ctx: {
        params: { id: '1' },
        query: { page: '2' },
        user: { id: 'u1' },
        prefs: { theme: 'dark' },
        parsed: {},
      } as any,
      base: '',
      isDev: false,
      loaderData: { items: ['a', 'b'] },
    })
    const body = await readStream(res.body!)
    assert.match(body, /window\.__WEIFUWU_CTX/)
    assert.match(body, /"params":/)
    assert.match(body, /"id":"1"/)
    assert.match(body, /"page":"2"/)
    assert.match(body, /"prefs":/)
    assert.match(body, /"loaderData":/)
    assert.match(body, /"user":/)
  })

  it('streamResponse injects loaderData props script', async () => {
    const { readStream, streamResponse } = await import('../stream.ts')
    const html = '<!DOCTYPE html><html><head></head><body><div id="__weifuwu_root"></div></body></html>'
    const reactStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(html))
        ctrl.close()
      },
    })
    const res = streamResponse(reactStream, {
      ctx: { params: {}, query: {}, prefs: {} } as any,
      base: '',
      isDev: false,
      loaderData: { items: ['a'] },
    })
    const body = await readStream(res.body!)
    assert.match(body, /window\.__WEIFUWU_PROPS/)
  })

  it('streamResponse injects dev livereload in dev mode', async () => {
    const { readStream, streamResponse } = await import('../stream.ts')
    const html = '<!DOCTYPE html><html><head></head><body><div id="__weifuwu_root"></div></body></html>'
    const reactStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(html))
        ctrl.close()
      },
    })
    const res = streamResponse(reactStream, {
      ctx: { params: {}, query: {}, prefs: {} } as any,
      base: '',
      isDev: true,
    })
    const body = await readStream(res.body!)
    assert.match(body, /__weifuwu\/livereload/)
    assert.match(body, /importmap/)
  })

  it('streamResponse handles custom status', async () => {
    const { streamResponse } = await import('../stream.ts')
    const html = '<!DOCTYPE html><html><head></head><body></body></html>'
    const reactStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(html))
        ctrl.close()
      },
    })
    const res = streamResponse(reactStream, {
      ctx: { params: {}, query: {}, prefs: {} } as any,
      base: '',
      isDev: false,
      status: 404,
    })
    assert.equal(res.status, 404)
  })

  it('streamResponse emits fallback HTML on error during streaming', async () => {
    const { readStream, streamResponse } = await import('../stream.ts')
    const brokenStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('<html><head>'))
        // Force error after enqueuing data
      },
      pull(_ctrl) {
        throw new Error('react render failed mid-stream')
      },
    })
    const res = streamResponse(brokenStream, {
      ctx: { params: {}, query: {}, prefs: {} } as any,
      base: '',
      isDev: false,
    })
    const body = await readStream(res.body!)
    assert.match(body, /500 - Internal Server Error/)
  })
})
