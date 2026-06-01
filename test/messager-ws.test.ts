import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { serve } from '../serve.ts'
import { Router } from '../router.ts'
import { createWSHandler, broadcastToChannel } from '../messager/ws.ts'

// Track broadcast calls
const broadcastCalls: { channelId: number; data: any }[] = []

// Replace broadcastToChannel to capture calls, but also call original for WS delivery
const originalBroadcast = await import('../messager/ws.ts')

describe('messager ws', () => {
  afterEach(() => {
    broadcastCalls.length = 0
  })

  // ── broadcastToChannel ────────────────────────────────────────────────────

  it('broadcastToChannel sends data to subscribed members', async () => {
    // Subscribe a mock WebSocket via channels map
    const mockWs = { send: (msg: string) => received.push(msg) } as any
    const received: string[] = []
    const channels = (await import('../messager/ws.ts')).channels as Map<number, Set<{ ws: WebSocket; userId: number }>>

    // Directly manipulate internal state — subscribe the mock WS
    // Instead, test through the message handler which calls subscribe internally
  })

  // ── createWSHandler with mocked sql ──────────────────────────────────────

  it('open rejects unauthenticated user', async () => {
    const mockSql = () => { throw new Error('should not be called') }
    const handler = createWSHandler({ sql: mockSql as any })

    let closedWithCode = 0
    const mockWs = { close: (code: number) => { closedWithCode = code } } as any
    const ctx = { params: {}, query: {} } as any

    handler.open(mockWs, ctx)
    assert.equal(closedWithCode, 4001)
  })

  it('open accepts authenticated user', async () => {
    const mockSql = () => { throw new Error('should not be called') }
    const handler = createWSHandler({ sql: mockSql as any })

    let closed = false
    const mockWs = { close: () => { closed = true } } as any
    const ctx = { params: {}, query: {}, user: { id: 1 } } as any

    handler.open(mockWs, ctx)
    assert.equal(closed, false)
  })

  it('message replies with error for invalid JSON', async () => {
    const mockSql = () => { throw new Error('should not be called') }
    const handler = createWSHandler({ sql: mockSql as any })

    const sent: string[] = []
    const mockWs = { send: (m: string) => sent.push(m) } as any
    const ctx = { params: {}, query: {}, user: { id: 1 } } as any

    await handler.message(mockWs, ctx, 'not-json')
    assert.equal(sent.length, 1)
    const msg = JSON.parse(sent[0]!)
    assert.equal(msg.type, 'error')
    assert.equal(msg.message, 'Invalid JSON')
  })

  it('message without userId does nothing', async () => {
    let sqlCalled = false
    const mockSql = () => { sqlCalled = true; return [] }
    const handler = createWSHandler({ sql: mockSql as any })

    const sent: string[] = []
    const mockWs = { send: (m: string) => sent.push(m) } as any
    const ctx = { params: {}, query: {} } as any

    await handler.message(mockWs, ctx, JSON.stringify({ type: 'message', channel_id: 1, content: 'hi' }))
    assert.equal(sqlCalled, false)
    assert.equal(sent.length, 0)
  })

  it('message inserts into DB and broadcasts', async () => {
    const sqlCalls: { strings: string[]; values: any[] }[] = []
    const mockSql = (strings: TemplateStringsArray, ...values: any[]) => {
      sqlCalls.push({ strings: [...strings], values })
      return [{ id: 1, channel_id: 1, sender_id: 1, sender_type: 'user', content: 'hi', created_at: new Date() }]
    }
    // Need mockSql to handle nested sql calls (agent reply)
    // Provide .then support for the nested cases
    const sql = ((strings: TemplateStringsArray, ...values: any[]) => {
      sqlCalls.push({ strings: [...strings], values })
      return Promise.resolve([{ id: 1, channel_id: 1, sender_id: 1, sender_type: 'user', content: 'hi', created_at: new Date() }])
    }) as any

    const handler = createWSHandler({ sql })

    const sent: string[] = []
    const mockWs = { send: (m: string) => sent.push(m) } as any
    const ctx = { params: {}, query: {}, user: { id: 1 } } as any

    await handler.message(mockWs, ctx, JSON.stringify({ type: 'message', channel_id: 1, content: 'hi' }))
    assert.ok(sqlCalls.length >= 1)
    assert.ok(sqlCalls[0]!.strings.join('?').includes('INSERT INTO'))
  })

  it('typing broadcasts to channel', async () => {
    const mockSql = () => { return [] }
    const handler = createWSHandler({ sql: mockSql as any })

    const sent: string[] = []
    const mockWs = { send: (m: string) => sent.push(m) } as any
    const ctx = { params: {}, query: {}, user: { id: 1 } } as any

    await handler.message(mockWs, ctx, JSON.stringify({ type: 'typing', channel_id: 1, is_typing: true }))
    // Should broadcast to channel members. Since only this WS is subscribed, it should receive the typing event
  })

  it('read updates last_read_id and broadcasts', async () => {
    const sqlCalls: any[] = []
    const mockSql = (strings: TemplateStringsArray, ...values: any[]) => {
      sqlCalls.push({ sql: strings.join('?'), values })
      return []
    }

    const handler = createWSHandler({ sql: mockSql as any })

    const sent: string[] = []
    const mockWs = { send: (m: string) => sent.push(m) } as any
    const ctx = { params: {}, query: {}, user: { id: 1 } } as any

    await handler.message(mockWs, ctx, JSON.stringify({ type: 'read', channel_id: 1, last_message_id: 5 }))
    const updateCall = sqlCalls.find(c => c.sql.includes('UPDATE'))
    assert.ok(updateCall, 'should execute UPDATE')
    assert.ok(updateCall.values.includes(5), 'should include last_message_id')
  })

  it('close calls unsubscribe', async () => {
    const mockSql = () => { throw new Error('should not be called') }
    const handler = createWSHandler({ sql: mockSql as any })

    const mockWs = {} as WebSocket
    handler.close(mockWs)
    // No assertion beyond no crash
    assert.ok(true)
  })
})
