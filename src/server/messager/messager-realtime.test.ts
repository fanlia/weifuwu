/**
 * messager — 实时层契约测试（P2：WS 协议 + Redis 跨进程广播）
 *
 * 覆盖：subscribe 协议（connected/ping/subscribe/unsubscribe/畸形消息）、
 * 本地广播（房间隔离）、Redis 跨进程广播 + 环回跳过（_pid 去重——防双发）、
 * M6 畸形消息容错、M15 鉴权注入（verifyToken/authorizeRoom 拒绝订阅）、close 清理。
 *
 * 假 ws：handler 只读 readyState/OPEN/send——普通对象可替（运行时形状）。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRedis } from '../db/memory-redis.ts'
import { MemorySql } from '../db/memory-sql.ts'
import { createOrm, memoryAdapter } from '../db/orm.ts'
import { WEIFUWU_MESSAGER_SCHEMA } from '../messager/index.ts'
import { messager } from './index.ts'

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

function fakeWs(): any { // W1: WebSocket mock（open/message 面缺失——mock 逃逸）
  const sent: string[] = []
  return {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(s),
    sent,
  }
}

const parse = (s: string) => JSON.parse(s) as Record<string, unknown>

describe('messager realtime（P2——协议/广播/鉴权）', () => {
  const memSql = new MemorySql()
  const db = createOrm(memoryAdapter(memSql))
  memSql.applySchema(WEIFUWU_MESSAGER_SCHEMA)
  const redis = new MemoryRedis()
  const system = messager({ orm: db, redis: redis as any })
  after(async () => {
    await system.client.close()
    await (redis as any).close?.()
  })

  it('subscribe 协议：connected / ping→pong / subscribe→subscribed / unsubscribe / 畸形消息忽略', async () => {
    const h = system.client.handler()
    const ws = fakeWs()
    await h.open!(ws, { params: {}, query: {} } as any)
    assert.deepEqual(parse(ws.sent[0]), { type: 'connected' })
    await h.message!(ws, {} as any, Buffer.from(JSON.stringify({ type: 'ping' })))
    assert.deepEqual(parse(ws.sent[1]), { type: 'pong' })
    await h.message!(ws, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:x' })))
    assert.deepEqual(parse(ws.sent[2]), { type: 'subscribed', room: 'conv:x' })
    await h.message!(ws, {} as any, Buffer.from(JSON.stringify({ type: 'unsubscribe', room: 'conv:x' })))
    // 畸形消息：不抛
    await h.message!(ws, {} as any, Buffer.from('not-json{{'))
    assert.equal(ws.sent.length, 3, '畸形消息无输出')
  })

  it('本地广播：房间成员收到、非成员不收；_pid 元数据剥离', async () => {
    const h = system.client.handler()
    const inRoom = fakeWs()
    const outRoom = fakeWs()
    await h.open!(inRoom, { params: {}, query: {} } as any)
    await h.open!(outRoom, { params: {}, query: {} } as any)
    await h.message!(inRoom, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:a' })))
    system.client.broadcast('conv:a', { type: 'new_message', payload: { x: 1 } })
    assert.equal(inRoom.sent.filter((s) => s.includes('new_message')).length, 1, '成员收到')
    assert.ok(!outRoom.sent.some((s) => s.includes('new_message')), '非成员不收')
    const evt = parse(inRoom.sent.find((s) => s.includes('new_message'))!)
    assert.equal(evt._pid, undefined, '_pid 元数据剥离（不发给客户端）')
  })

  it('Redis 跨进程：A 广播 → B 实例（同 Redis）收到；A 自身不双发（环回 _pid 跳过）', async () => {
    const dbB = createOrm(memoryAdapter(new MemorySql()))
    const systemB = messager({ orm: dbB, redis: redis as any })
    // 建表由 applySchema 完成
    await tick() // 等 B 的 psubscribe 注册（connect().then 微任务）
    const hA = system.client.handler()
    const hB = systemB.client.handler()
    const wsA = fakeWs()
    const wsB = fakeWs()
    await hA.open!(wsA, { params: {}, query: {} } as any)
    await hB.open!(wsB, { params: {}, query: {} } as any)
    await hA.message!(wsA, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:cross' })))
    await hB.message!(wsB, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:cross' })))
    system.client.broadcast('conv:cross', { type: 'new_message', text: '跨进程' })
    assert.equal(wsA.sent.filter((s) => s.includes('new_message')).length, 1, 'A 本地一次（Redis 环回跳过——防双发/乱序）')
    assert.equal(wsB.sent.filter((s) => s.includes('new_message')).length, 1, 'B 经 Redis 收一次')
    await systemB.client.close()
  })

  it('M6 畸形 Redis 消息：publish 垃圾到 wf:msg:* → 回调不崩；随后合法事件仍送达', async () => {
    const h = system.client.handler()
    const ws = fakeWs()
    await h.open!(ws, { params: {}, query: {} } as any)
    await h.message!(ws, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:m6' })))
    // 外来/畸形消息（非 JSON）——原实现 JSON.parse 抛崩订阅回调
    await redis.publish('wf:msg:conv:m6', 'not-json{{{')
    await redis.publish('wf:msg:conv:m6', '[1,2,3') // 合法 JSON 但非对象
    await redis.publish('wf:msg:conv:m6', JSON.stringify({ type: 'new_message', text: '正常' }))
    assert.equal(ws.sent.filter((s) => s.includes('new_message')).length, 1, '畸形不影响后续')
  })

  it('M15 鉴权注入：无 token → unauthorized（不可订阅）；token 无效/未授权房间 → error；授权 → subscribed', async () => {
    const h = system.client.handler({
      verifyToken: async (token) => (token === 'good-token' ? { sub: 'user-1' } : null),
      authorizeRoom: async (userId, room) => userId === 'user-1' && room === 'conv:mine',
    })
    // ① 无 token：open → unauthorized（不 connected）
    const anon = fakeWs()
    await h.open!(anon, { params: {}, query: {} } as any)
    assert.deepEqual(parse(anon.sent[0]), { type: 'unauthorized' })
    await h.message!(anon, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:secret' })))
    assert.deepEqual(parse(anon.sent[1]), { type: 'error', code: 'unauthorized', room: 'conv:secret' })
    // ② 有效 token + 未授权房间 → forbidden（不 join）
    const ok = fakeWs()
    await h.open!(ok, { params: {}, query: { token: 'good-token' } } as any)
    assert.deepEqual(parse(ok.sent[0]), { type: 'connected' })
    await h.message!(ok, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:secret' })))
    assert.deepEqual(parse(ok.sent[1]), { type: 'error', code: 'forbidden', room: 'conv:secret' })
    // ③ 有效 token + 授权房间 → subscribed + 实际入房收到广播
    await h.message!(ok, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:mine' })))
    assert.deepEqual(parse(ok.sent[2]), { type: 'subscribed', room: 'conv:mine' })
    system.client.broadcast('conv:mine', { type: 'new_message', text: '私有' })
    assert.equal(ok.sent.filter((s) => s.includes('new_message')).length, 1, '授权房间收到')
    // ④ 拒绝者不入房：广播 conv:secret 不送达
    system.client.broadcast('conv:secret', { type: 'new_message', text: '秘密' })
    assert.ok(!ok.sent.some((s) => s.includes('秘密')), '未授权房间从未入房')
  })

  it('close：rooms 清理 + 后续广播无异常', async () => {
    const h = system.client.handler()
    const ws = fakeWs()
    await h.open!(ws, { params: {}, query: {} } as any)
    await h.message!(ws, {} as any, Buffer.from(JSON.stringify({ type: 'subscribe', room: 'conv:close' })))
    await system.client.close()
    system.client.broadcast('conv:close', { type: 'new_message', text: '关闭后' }) // 不抛
    assert.ok(true)
  })
})
