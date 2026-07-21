/**
 * WebSocket Hub — 房间管理 + 消息广播
 */

import type { WebSocket, WebSocketHandler } from 'weifuwu'

type RoomId = string

class WebSocketHub {
  /** departmentId → 订阅的 WebSocket 集合 */
  private rooms = new Map<RoomId, Set<WebSocket>>()

  /** ws → 已订阅的房间集合（断开时清理） */
  private wsRooms = new Map<WebSocket, Set<RoomId>>()

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
        // 清理空房间
        if (this.rooms.get(rid)?.size === 0) this.rooms.delete(rid)
      }
    }
    this.wsRooms.delete(ws)
  }

  /** 广播消息到房间所有订阅者 */
  broadcast(roomId: RoomId, message: Record<string, unknown>) {
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

/** 返回 WebSocketHandler，供 app.ws() 使用 */
export function createWsHandler(): WebSocketHandler {
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
