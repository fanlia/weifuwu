/**
 * WebSocket Hub — 房间管理 + 消息广播 + Redis Pub/Sub 多实例支持
 *
 * 用法:
 *   import { wsHub, createWsHandler } from './ws-hub.ts'
 *
 *   // 纯内存模式（默认）
 *   app.ws('/ws', createWsHandler())
 *
 *   // Redis Pub/Sub 模式（多实例部署）
 *   import { redis } from 'weifuwu'
 *   const r = redis()
 *   app.use(r)
 *   app.ws('/ws', createWsHandler({ redis: r.redis }))
 *   wsHub.initRedis(r.redis)
 */

import type { WebSocket, WebSocketHandler } from 'weifuwu'

type RoomId = string
type WsMsg = Record<string, unknown>

/** Redis Pub/Sub 通道前缀 */
const REDIS_CHANNEL_PREFIX = 'ws:broadcast:'
const REDIS_PATTERN = `${REDIS_CHANNEL_PREFIX}*`

class WebSocketHub {
  /** departmentId → 订阅的 WebSocket 集合 */
  private rooms = new Map<RoomId, Set<WebSocket>>()

  /** ws → 已订阅的房间集合（断开时清理） */
  private wsRooms = new Map<WebSocket, Set<RoomId>>()

  /** Redis 客户端（可选） */
  private redisClient: any = null
  private redisSubscriber: any = null
  private redisInitialized = false

  /**
   * 初始化 Redis Pub/Sub
   * 在 app.ws() 之后调用
   */
  initRedis(redis: any): void {
    if (this.redisInitialized) return
    this.redisInitialized = true
    this.redisClient = redis

    // 创建独立的 subscriber 连接（ioredis 需要单独的连接做 subscribe）
    // 如果 redis 是 ioredis 实例
    if (redis.duplicate) {
      this.redisSubscriber = redis.duplicate()
    } else {
      this.redisSubscriber = redis
    }

    // 订阅所有广播通道
    this.redisSubscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const roomId = channel.slice(REDIS_CHANNEL_PREFIX.length)
      if (!roomId) return

      // 解析消息
      let payload: WsMsg
      try { payload = JSON.parse(message) } catch { return }

      // 只广播到本地 WebSocket 连接
      this.broadcastLocal(roomId, payload)
    })

    this.redisSubscriber.psubscribe(REDIS_PATTERN)
    console.log('[ws-hub] Redis Pub/Sub 已初始化')
  }

  /** 加入房间 */
  join(roomId: RoomId, ws: WebSocket) {
    let room = this.rooms.get(roomId)
    if (!room) { room = new Set(); this.rooms.set(roomId, room) }
    room.add(ws)

    let subscribed = this.wsRooms.get(ws)
    if (!subscribed) { subscribed = new Set(); this.wsRooms.set(ws, subscribed) }
    subscribed.add(roomId)
  }

  /** 离开房间 */
  leave(roomId: RoomId, ws: WebSocket) {
    this.rooms.get(roomId)?.delete(ws)
    this.wsRooms.get(ws)?.delete(roomId)
  }

  /** ws 断开时清理所有订阅 */
  disconnect(ws: WebSocket) {
    const rooms = this.wsRooms.get(ws)
    if (rooms) {
      for (const rid of rooms) {
        this.rooms.get(rid)?.delete(ws)
        if (this.rooms.get(rid)?.size === 0) this.rooms.delete(rid)
      }
    }
    this.wsRooms.delete(ws)
  }

  /**
   * 广播消息到房间所有订阅者
   *
   * - 内存模式: 直接发送到本地 WebSocket
   * - Redis 模式: 发布到 Redis，所有实例的 subscriber 都会收到并广播到本地
   */
  broadcast(roomId: RoomId, message: WsMsg) {
    // 1. 发送到本地 WebSocket
    this.broadcastLocal(roomId, message)

    // 2. 如果 Redis 可用，发布到 Redis 让其他实例也广播
    if (this.redisClient) {
      const payload = JSON.stringify(message)
      try {
        this.redisClient.publish(`${REDIS_CHANNEL_PREFIX}${roomId}`, payload)
      } catch (err) {
        console.error('[ws-hub] Redis publish error:', err)
      }
    }
  }

  /** 广播到本地 WebSocket（不经过 Redis） */
  private broadcastLocal(roomId: RoomId, message: WsMsg) {
    const room = this.rooms.get(roomId)
    if (!room || room.size === 0) return
    const payload = JSON.stringify(message)
    for (const ws of room) {
      try { ws.send(payload) } catch { /* ignore closed sockets */ }
    }
  }

  /** 房间订阅数 */
  subscriberCount(roomId: RoomId): number {
    return this.rooms.get(roomId)?.size ?? 0
  }
}

/** 全局单例 */
export const wsHub = new WebSocketHub()

/** WebSocketHandler 配置 */
export interface WsHandlerOptions {
  /** Redis 客户端实例（可选）。提供后启用跨实例广播 */
  redis?: any
}

/** 返回 WebSocketHandler，供 app.ws() 使用 */
export function createWsHandler(opts?: WsHandlerOptions): WebSocketHandler {
  return {
    open(ws: WebSocket) {
      ws.send(JSON.stringify({ type: 'connected' }))
    },

    message(ws: WebSocket, _ctx: any, data: string | Buffer) {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'subscribe' && msg.departmentId) {
          wsHub.join(msg.departmentId, ws)
          ws.send(JSON.stringify({ type: 'subscribed', departmentId: msg.departmentId }))
        } else if (msg.type === 'unsubscribe' && msg.departmentId) {
          wsHub.leave(msg.departmentId, ws)
        }
      } catch { /* ignore malformed */ }
    },

    close(ws: WebSocket) {
      wsHub.disconnect(ws)
    },
  }
}
