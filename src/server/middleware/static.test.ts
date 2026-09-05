import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm, open, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync, brotliCompressSync, brotliDecompressSync, gunzipSync } from 'node:zlib'
import { serveStatic } from '../middleware/static.ts'

const tmpDir = join(import.meta.dirname || '.', '.tmp-static')

describe('serveStatic', () => {
  before(async () => {
    await mkdir(tmpDir, { recursive: true })
    await writeFile(join(tmpDir, 'hello.txt'), 'hello world')
    await writeFile(join(tmpDir, 'index.html'), '<h1>index</h1>')
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('serves a file', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello world')
  })

  it('serves index.html for directory', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/'), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 200)
    assert.ok((await res.text()).includes('index'))
  })

  it('returns 404 for missing file', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/missing.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 404)
  })

  it('sets content-type header', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.ok(res.headers.get('content-type')?.includes('text/plain'))
  })

  it('sets cache-control when configured', async () => {
    const handler = serveStatic(tmpDir, { maxAge: 3600 })
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.ok(res.headers.get('cache-control'), 'should set cache-control header')
  })

  // ── S8：Range 请求 + 预压缩探测（SERVER-PERF-PLAN 波次 3） ──

  it('S8: 200 响应带 Accept-Ranges: bytes（视频 seek 前置条件）', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.headers.get('accept-ranges'), 'bytes')
    assert.equal(res.status, 200)
  })

  it('S8: Range bytes=0-4 → 206 + Content-Range + 截取内容', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { Range: 'bytes=0-4' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('content-range'), 'bytes 0-4/11')
    assert.equal(await res.text(), 'hello')
  })

  it('S8: Range 开区间 bytes=6- → 从 6 到末尾', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { Range: 'bytes=6-' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('content-range'), 'bytes 6-10/11')
    assert.equal(await res.text(), 'world')
  })

  it('S8: 后缀 Range bytes=-5 → 末 5 字节', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { Range: 'bytes=-5' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 206)
    assert.equal(await res.text(), 'world')
  })

  it('S8: 越界 Range → 416 + Content-Range bytes */size', async () => {
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { Range: 'bytes=99-' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.status, 416)
    assert.equal(res.headers.get('content-range'), 'bytes */11')
  })

  it('S8: 预压缩 .gz 存在 + Accept-Encoding: gzip → 服务压缩产物（Content-Type 保留原类型）', async () => {
    await writeFile(join(tmpDir, 'hello.txt.gz'), gzipSync(Buffer.from('hello world')))
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { 'Accept-Encoding': 'gzip' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.headers.get('content-encoding'), 'gzip')
    assert.ok(res.headers.get('content-type')?.includes('text/plain'), '类型按原文件判定')
    assert.equal(gunzipSync(Buffer.from(await res.arrayBuffer())).toString(), 'hello world')
  })

  it('S8: br 优先于 gz', async () => {
    await writeFile(join(tmpDir, 'hello.txt.gz'), gzipSync(Buffer.from('hello world')))
    await writeFile(join(tmpDir, 'hello.txt.br'), brotliCompressSync(Buffer.from('hello world')))
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt', { headers: { 'Accept-Encoding': 'gzip, br' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.headers.get('content-encoding'), 'br')
    assert.equal(brotliDecompressSync(Buffer.from(await res.arrayBuffer())).toString(), 'hello world')
  })

  it('S8: 无 Accept-Encoding → 服务原文件', async () => {
    await writeFile(join(tmpDir, 'hello.txt.gz'), gzipSync(Buffer.from('STALE')))
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/hello.txt'), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.headers.get('content-encoding'), null)
    assert.equal(await res.text(), 'hello world')
  })

  it('S8: 预压缩产物陈旧（mtime 早于原文件）→ 回退原文件（防陈旧内容）', async () => {
    const old = await open(join(tmpDir, 'stale.txt.gz'), 'w')
    await old.writeFile(gzipSync(Buffer.from('OLD COMPRESSED')))
    await old.close()
    // 原文件在其后写入（mtime 更新）——utimes 确定性置旧 .gz mtime（同 ms 写入会碰撞）
    const oldTime = new Date(Date.now() - 60_000)
    await utimes(join(tmpDir, 'stale.txt.gz'), oldTime, oldTime)
    await writeFile(join(tmpDir, 'stale.txt'), 'fresh content')
    const handler = serveStatic(tmpDir)
    const res = await handler(new Request('http://localhost/stale.txt', { headers: { 'Accept-Encoding': 'gzip' } }), { params: {}, query: {} } as any, undefined as never)
    assert.equal(res.headers.get('content-encoding'), null, '陈旧预压缩不服务')
    assert.equal(await res.text(), 'fresh content')
  })
})
