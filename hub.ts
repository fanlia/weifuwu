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
  }

  function leave(ws: WebSocket): void {
    const keys = wsKeys.get(ws)
    if (keys) {
      for (const key of keys) {
        channels.get(key)?.delete(ws)
      }
      wsKeys.delete(ws)
    }
  }

  function broadcast(key: string, data: unknown): void {
    const msg = JSON.stringify(data)
    const members = channels.get(key)
    if (members) {
      for (const ws of members) {
        try { ws.send(msg) } catch {}
      }
    }
    redisPub?.publish(`${prefix}${key}`, msg)
  }

  async function close(): Promise<void> {
    channels.clear()
    if (redisSub) {
      await redisSub.quit()
    }
  }

  return { join, leave, broadcast, close }
}
