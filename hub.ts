import type { Redis, WebSocket } from './vendor.ts'
import type { Closeable } from './types.ts'

/** Options for {@link createHub}. */
export interface HubOptions {
  /** Optional Redis client for cross-process pub/sub broadcast. */
  redis?: Redis
  /** Key prefix for Redis channels (default: `'hub:'`). */
  prefix?: string
}

/**
 * In-memory (and optionally Redis-backed) pub/sub hub for WebSocket rooms.
 *
 * Used internally by the WebSocket handler to implement `ctx.ws.join()` / `ctx.ws.sendRoom()`. */
export interface Hub extends Closeable {
  /** Subscribe a WebSocket to a room/group. */
  join(key: string, ws: WebSocket): void
  /** Unsubscribe a WebSocket from all rooms. */
  leave(ws: WebSocket): void
  /** Send a JSON message to all members of a room. */
  broadcast(key: string, data: unknown): void
  /** Close the hub, disconnect Redis subscribers, clear all rooms. */
  close(): Promise<void>
}

/**
 * Create a pub/sub hub for WebSocket room management.
 *
 * In-memory by default. Pass `redis` to enable cross-process broadcasting.
 *
 * ```ts
 * import { createHub } from 'weifuwu'
 *
 * const hub = createHub()
 * hub.join('room:general', ws)
 * hub.broadcast('room:general', { type: 'chat', text: 'Hello' })
 * ```
 */
export function createHub(opts?: HubOptions): Hub {
  const prefix = opts?.prefix ?? 'hub:'
  const channels = new Map<string, Set<WebSocket>>()
  const wsKeys = new Map<WebSocket, Set<string>>()

  let redisPub: Redis | undefined
  let redisSub: Redis | null = null

  if (opts?.redis) {
    redisPub = opts.redis
    redisSub = opts.redis.duplicate()
    redisSub.on('message', (rawChannel: string, rawData: string) => {
      if (!rawChannel.startsWith(prefix)) return
      const key = rawChannel.slice(prefix.length)
      const members = channels.get(key)
      if (!members) return
      for (const ws of members) {
        try { ws.send(rawData) } catch {}
      }
    })
  }

  function join(key: string, ws: WebSocket): void {
    if (!channels.has(key)) {
      channels.set(key, new Set())
      redisSub?.subscribe(`${prefix}${key}`)
    }
    channels.get(key)!.add(ws)
    let keys = wsKeys.get(ws)
    if (!keys) { keys = new Set(); wsKeys.set(ws, keys) }
    keys.add(key)
    // Auto-cleanup on close (if WebSocket supports addEventListener)
    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('close', () => removeFromChannels(ws))
      ws.addEventListener('error', () => removeFromChannels(ws))
    }
  }

  function removeFromChannels(ws: WebSocket): void {
    const keys = wsKeys.get(ws)
    if (keys) {
      for (const key of keys) {
        const members = channels.get(key)
        if (members) {
          members.delete(ws)
          if (members.size === 0) channels.delete(key)
        }
      }
      wsKeys.delete(ws)
    }
  }

  function leave(ws: WebSocket): void {
    removeFromChannels(ws)
  }

  function broadcast(key: string, data: unknown): void {
    const msg = JSON.stringify(data)
    const members = channels.get(key)
    if (members) {
      const dead: WebSocket[] = []
      for (const ws of members) {
        try { ws.send(msg) } catch { dead.push(ws) }
      }
      for (const ws of dead) removeFromChannels(ws)
    }
    redisPub?.publish(`${prefix}${key}`, msg)
  }

  async function close(): Promise<void> {
    // Disconnect stale WebSocket listeners
    for (const ws of wsKeys.keys()) {
      removeFromChannels(ws)
    }
    channels.clear()
    wsKeys.clear()
    if (redisSub) {
      redisSub.removeAllListeners('message')
      await redisSub.quit()
    }
    redisPub = undefined
    redisSub = null
  }

  return { join, leave, broadcast, close }
}
