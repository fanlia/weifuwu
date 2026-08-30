/**
 * DB 协议服务器契约测试（MemoryRedisServer / MemoryPostgresServer——DB-FIX-PLAN W1 防线）
 *
 * 锁定（每项 = 修复前实测复现 → 修复后翻转）：
 * - AUTH 写回（per-connection ctx 传引用）——AUTH 后同连接（含同 chunk pipeline）全部命令可用
 * - MemoryPostgresServer.close() 销毁存量连接——close 限时返回（不挂起）
 * - BLPOP timeout 参数生效（>0 超时回 null）+ LPUSH 唤醒 + 同连接多 waiter 不互覆
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { MemoryRedisServer } from './redis-server.ts'
import { MemoryPostgresServer } from './postgres-server.ts'
import { RedisClient } from './redis/client.ts'

/** 裸 socket RESP 客户端（AUTH 往返测试——RedisConnection 无 password 选项） */
class RawRedis {
  private sock: net.Socket
  private buf = ''
  private waiters: (() => void)[] = []

  constructor(port: number) {
    this.sock = net.connect(port, '127.0.0.1')
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.sock.once('connect', () => resolve())
      this.sock.once('error', (e) => reject(e))
    })
    this.sock.on('data', (d) => {
      this.buf += d.toString()
      const ws = this.waiters
      this.waiters = []
      for (const w of ws) w()
    })
  }

  /** 一次 chunk 发送多条命令（pipeline batch） */
  send(...cmds: string[][]): void {
    let payload = ''
    for (const cmd of cmds) {
      payload += `*${cmd.length}\r\n`
      for (const a of cmd) payload += `$${Buffer.byteLength(a)}\r\n${a}\r\n`
    }
    this.sock.write(payload)
  }

  /** 等待新应答到达（相对 before 的增量） */
  async waitReply(ms = 500): Promise<string[]> {
    const before = this.buf.length
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), ms)
      this.waiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    return this.buf.slice(before).split('\r\n').filter(Boolean)
  }

  destroy(): void {
    this.sock.destroy()
  }
}

describe('MemoryRedisServer — AUTH 契约（V1 防线）', () => {
  it('AUTH 写回 ctx：AUTH 后同 chunk pipeline 命令全部可用（修复前 NOAUTH）', async () => {
    const srv = new MemoryRedisServer({ password: 'pw' })
    await srv.start()
    const raw = new RawRedis(srv.port)
    await raw.open()
    raw.send(['AUTH', 'pw'], ['SET', 'k', 'v'], ['GET', 'k'])
    const lines = await raw.waitReply()
    raw.destroy()
    await srv.close()
    // AUTH→+OK、SET→+OK、GET→$1 v（修复前：+OK 后全部 -NOAUTH）
    assert.deepEqual(lines, ['+OK', '+OK', '$1', 'v'])
  })

  it('错误口令 → WRONGPASS 且连接保持未认证', async () => {
    const srv = new MemoryRedisServer({ password: 'pw' })
    await srv.start()
    const raw = new RawRedis(srv.port)
    await raw.open()
    raw.send(['AUTH', 'bad'], ['GET', 'k'])
    const lines = await raw.waitReply()
    raw.destroy()
    await srv.close()
    assert.match(lines[0], /WRONGPASS/)
    assert.match(lines[1], /NOAUTH/)
  })

  it('无密码服务器 AUTH → 显式报错（真库语义）', async () => {
    const srv = new MemoryRedisServer()
    await srv.start()
    const raw = new RawRedis(srv.port)
    await raw.open()
    raw.send(['AUTH', 'x'])
    const lines = await raw.waitReply()
    raw.destroy()
    await srv.close()
    assert.match(lines[0], /no password is set/)
  })
})

describe('MemoryRedisServer — BLPOP 契约（V3 防线）', () => {
  it('timeout 参数生效：>0 超时回 null（修复前永久挂起）', async () => {
    const srv = new MemoryRedisServer()
    await srv.start()
    const c = await RedisClient.connect({ port: srv.port })
    const t0 = Date.now()
    const v = await c.command('BLPOP', 'empty', 0.3)
    const elapsed = Date.now() - t0
    await c.close()
    await srv.close()
    assert.equal(v, null)
    assert.ok(elapsed >= 250, `超时应 ~300ms，实际 ${elapsed}ms`)
    assert.ok(elapsed < 2000, `超时不得挂起，实际 ${elapsed}ms`)
  })

  it('LPUSH 唤醒阻塞的 BLPOP（跨连接）', async () => {
    const srv = new MemoryRedisServer()
    await srv.start()
    const c1 = await RedisClient.connect({ port: srv.port })
    const c2 = await RedisClient.connect({ port: srv.port })
    const blocked = c1.command('BLPOP', 'q', 0) // 0 = 无限阻塞
    await new Promise((r) => setTimeout(r, 50)) // 等 c1 挂起
    await c2.lpush('q', 'hello')
    const v = await Promise.race([
      blocked,
      new Promise((_, rej) => setTimeout(() => rej(new Error('LPUSH 未唤醒 BLPOP')), 1500)),
    ])
    await c1.close()
    await c2.close()
    await srv.close()
    assert.deepEqual(v, ['q', 'hello'])
  })

  it('同连接多 BLPOP waiter 不互覆（修复前 Map 单槽覆盖——第一个泄漏挂起）', async () => {
    const srv = new MemoryRedisServer()
    await srv.start()
    const c1 = await RedisClient.connect({ port: srv.port })
    const c2 = await RedisClient.connect({ port: srv.port })
    const p1 = c1.command('BLPOP', 'k1', 0)
    const p2 = c1.command('BLPOP', 'k2', 0) // 同连接第二个 BLPOP
    await new Promise((r) => setTimeout(r, 50))
    await c2.lpush('k1', 'a')
    await c2.lpush('k2', 'b')
    const [v1, v2] = await Promise.race([
      Promise.all([p1, p2]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('waiter 被覆盖——泄漏挂起')), 1500)),
    ])
    await c1.close()
    await c2.close()
    await srv.close()
    assert.deepEqual(v1, ['k1', 'a'])
    assert.deepEqual(v2, ['k2', 'b'])
  })

  it('连接关闭释放挂起的 BLPOP（不泄漏 pending promise）', async () => {
    const srv = new MemoryRedisServer()
    await srv.start()
    const c1 = await RedisClient.connect({ port: srv.port, maxRetries: 0, enableOfflineQueue: false })
    const blocked = c1.command('BLPOP', 'q', 0).catch(() => 'closed')
    await new Promise((r) => setTimeout(r, 50))
    await c1.close() // 触发连接清理——waiter 释放
    const v = await Promise.race([
      blocked,
      new Promise((_, rej) => setTimeout(() => rej(new Error('连接关闭后 BLPOP 未释放')), 1500)),
    ])
    await srv.close()
    assert.ok(v === null || v === 'closed')
  })
})

describe('MemoryPostgresServer — 生命周期契约（V2 防线）', () => {
  it('close() 销毁存量连接——带存活客户端 close 限时返回（修复前永久挂起）', async () => {
    const srv = new MemoryPostgresServer()
    await srv.start()
    const sock = net.connect(srv.port, '127.0.0.1')
    await new Promise<void>((r) => sock.once('connect', () => r()))
    await Promise.race([
      srv.close(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('pg close 挂起 >2s')), 2000)),
    ])
    sock.destroy()
    assert.ok(true)
  })

  it('close 幂等', async () => {
    const srv = new MemoryPostgresServer()
    await srv.start()
    await srv.close()
    await srv.close()
    assert.ok(true)
  })
})
