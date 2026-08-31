/**
 * WebSocket 内存 Hub（ROUTER-CORE 波次 E 纯移动拆解——2027-10）
 *
 * createInMemoryHub 自 router.ts 移出（零耦合——纯发布/订阅实现）。
 * 每个房间是一个字符串 key，WebSocket 通过 join/leave 管理订阅。
 * 多实例部署传自定义 Hub（Redis 后端）——wsHub() 注入。
 */
import type { WebSocket } from 'ws'
import type { Hub } from './ws.ts'

export function createInMemoryHub(): Hub {
  const rooms = new Map<string, Set<WebSocket>>()
  const wsRooms = new Map<WebSocket, Set<string>>()

  return {
    join(key: string, ws: WebSocket) {
      let members = rooms.get(key)
      if (!members) { members = new Set(); rooms.set(key, members) }
      members.add(ws)
      let keys = wsRooms.get(ws)
      if (!keys) { keys = new Set(); wsRooms.set(ws, keys) }
      keys.add(key)
    },
    leave(ws: WebSocket) {
      const keys = wsRooms.get(ws)
      if (!keys) return
      for (const key of keys) {
        const members = rooms.get(key)
        if (members) { members.delete(ws); if (members.size === 0) rooms.delete(key) }
      }
      wsRooms.delete(ws)
    },
    send(key: string, message: string) {
      const members = rooms.get(key)
      if (!members) return
      for (const ws of members) {
        try { ws.send(message) } catch { /* ignore disconnected */ }
      }
    },
    async close() {
      rooms.clear()
      wsRooms.clear()
    },
  }
}
