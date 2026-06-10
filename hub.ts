import type { Redis } from './vendor.ts'

export interface HubOptions {
  redis?: Redis
  prefix?: string
}

export interface Hub {
  join(key: string, ws: WebSocket): void
  leave(ws: WebSocket): void
  broadcast(key: string, data: unknown): void
  close(): Promise<void>
}

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
