/**
 * fetch-url 技能 http_get handler 契约测试（2027-09——AI 工具覆盖审计补全）
 *
 * 审计结论：http_get（fetch-url 技能）handler 零覆盖——**SSRF 防护安全关键**
 * （内网地址拒绝——10.x/127.x/172.16-31/192.168/0.x/169.254）——本文件补
 * 防护矩阵 + 协议限制 + fetch 成功/失败面（mock fetch——不依赖真实网络）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandlers, isPrivate } from '../skills/builtin/fetch-url/tools.ts'

// ── isPrivate 防护矩阵（SSRF 核心——纯函数） ──
test('isPrivate：内网前缀全拒绝', () => {
  const privates = ['10.0.0.1', '10.255.255.255', '127.0.0.1', '127.255.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.168.255.1', '0.0.0.0', '169.254.169.254', '169.254.0.1']
  for (const a of privates) assert.equal(isPrivate(a), true, `${a} 应判为内网`)
})

test('isPrivate：公网/边界拒绝面不误伤', () => {
  const publics = ['172.15.255.255', '172.32.0.1', '192.169.0.1', '11.0.0.1', '8.8.8.8', '100.64.0.1', '2001:4860:4860::8888', 'example.com', 'not-an-ip']
  for (const a of publics) assert.equal(isPrivate(a), false, `${a} 不应判为内网`)
})

test('http_get：非 http/https 协议拒绝（在 DNS 前——无网络）', async () => {
  const handlers = createHandlers()
  const r = await handlers.http_get({ url: 'ftp://example.com/x' }) as any
  assert.equal(r.ok, false)
  assert.match(r.error, /仅支持 http\/https/)
})

test('http_get：公网成功——mock fetch（无真实网络）', async () => {
  // mock 全局 fetch（handler 内直接调用全局 fetch）
  const orig = globalThis.fetch
  globalThis.fetch = (async () => new Response('<html><title>测试页</title>正文内容', { status: 200 })) as any
  try {
    const handlers = createHandlers()
    const r = await handlers.http_get({ url: 'https://example.com/doc' }) as any
    assert.equal(r.ok, true)
    assert.match(String(r.content), /测试页/)
  } finally {
    globalThis.fetch = orig
  }
})

test('http_get：HTTP 错误码透传（ok:false + status——不吞）', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = (async () => new Response('not found', { status: 404 })) as any
  try {
    const handlers = createHandlers()
    const r = await handlers.http_get({ url: 'https://example.com/missing' }) as any
    assert.equal(r.ok, false)
    assert.match(r.error, /HTTP 404/)
  } finally {
    globalThis.fetch = orig
  }
})
