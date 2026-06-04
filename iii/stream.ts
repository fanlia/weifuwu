import type { Redis } from '../vendor.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { StreamUpdateOp, StreamSubscription } from './types.ts'

const channels = new Map<string, Set<WebSocket>>()

function notify(stream: string, group: string, item: string, event: string, data: unknown) {
  const keys = [
    `${stream}`,
    `${stream}:${group}`,
    `${stream}:${group}:${item}`,
  ]
  const msg = JSON.stringify({ type: 'stream', stream_name: stream, group_id: group, item_id: item, event, data })
  for (const key of keys) {
    const subs = channels.get(key)
    if (!subs) continue
    for (const ws of subs) {
      try { ws.send(msg) } catch {}
    }
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function applyOps(value: any, ops: StreamUpdateOp[]): any {
  let current = deepClone(value ?? {})
  for (const op of ops) {
    switch (op.op) {
      case 'set':
        current = deepClone(op.value)
        break
      case 'merge':
        if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
          current = { ...current, ...deepClone(op.value) }
        } else {
          current = deepClone(op.value)
        }
        break
      case 'increment':
        current = (typeof current === 'number' ? current : 0) + op.value
        break
      case 'decrement':
        current = (typeof current === 'number' ? current : 0) - op.value
        break
      case 'append':
        if (!Array.isArray(current)) current = []
        current.push(deepClone(op.value))
        break
      case 'remove':
        current = null
        break
    }
  }
  return current
}

function createMemoryStore() {
  const store = new Map<string, unknown>()

  function key(stream: string, group: string, item: string) {
    return `${stream}:${group}:${item}`
  }

  return {
    async set(stream: string, group: string, item: string, data: unknown) {
      const k = key(stream, group, item)
      const old = store.get(k) ?? null
      store.set(k, deepClone(data))
      notify(stream, group, item, 'set', data)
      return { old_value: old, new_value: deepClone(data) }
    },
    async get(stream: string, group: string, item: string) {
      const v = store.get(key(stream, group, item)) ?? null
      return { value: deepClone(v) }
    },
    async delete(stream: string, group: string, item: string) {
      const k = key(stream, group, item)
      const old = store.get(k) ?? null
      store.delete(k)
      notify(stream, group, item, 'delete', null)
      return { old_value: old }
    },
    async list(stream: string, group: string) {
      const items: { item_id: string; data: unknown }[] = []
      const prefix = `${stream}:${group}:`
      for (const [k, v] of store) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes(':')) {
          items.push({ item_id: k.slice(prefix.length), data: deepClone(v) })
        }
      }
      return { items }
    },
    async list_groups(stream: string) {
      const groups = new Set<string>()
      const prefix = `${stream}:`
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length)
          const g = rest.split(':')[0]
          if (g) groups.add(g)
        }
      }
      return { groups: Array.from(groups) }
    },
    async list_all() {
      const streamMap = new Map<string, { groups: Set<string>; items: Set<string> }>()
      for (const k of store.keys()) {
        const parts = k.split(':')
        const s = parts[0]
        const g = parts[1]
        if (!streamMap.has(s)) streamMap.set(s, { groups: new Set(), items: new Set() })
        const entry = streamMap.get(s)!
        if (g) entry.groups.add(g)
        entry.items.add(k)
      }
      const streams = Array.from(streamMap.entries()).map(([name, info]) => ({
        stream_name: name,
        group_count: info.groups.size,
        item_count: info.items.size,
      }))
      return { streams, count: streams.length }
    },
    async send(stream: string, group: string, type: string, data: unknown, id?: string) {
      notify(stream, group, id ?? '', 'send', { type, data })
    },
    async update(stream: string, group: string, item: string, ops: StreamUpdateOp[]) {
      const k = key(stream, group, item)
      const old = deepClone(store.get(k) ?? null)
      const newVal = applyOps(old, ops)
      store.set(k, deepClone(newVal))
      notify(stream, group, item, 'update', newVal)
      return { old_value: old, new_value: deepClone(newVal) }
    },
  }
}

function createPgStore(pg: PostgresClient) {
  const sql = pg.sql

  return {
    async set(stream: string, group: string, item: string, data: unknown) {
      const rows = await sql`
        INSERT INTO "_iii_stream" (stream_name, group_id, item_id, data)
        VALUES (${stream}, ${group}, ${item}, ${data as any})
        ON CONFLICT (stream_name, group_id, item_id)
        DO UPDATE SET data = ${data as any}, updated_at = NOW()
        RETURNING data
      `
      notify(stream, group, item, 'set', data)
      return { old_value: null, new_value: data }
    },
    async get(stream: string, group: string, item: string) {
      const rows = await sql`
        SELECT data FROM "_iii_stream"
        WHERE stream_name = ${stream} AND group_id = ${group} AND item_id = ${item}
      `
      const row = rows[0] as any
      let value = row?.data ?? null
      if (typeof value === 'string') value = JSON.parse(value)
      return { value }
    },
    async delete(stream: string, group: string, item: string) {
      const rows = await sql`
        DELETE FROM "_iii_stream"
        WHERE stream_name = ${stream} AND group_id = ${group} AND item_id = ${item}
        RETURNING data
      `
      const old = (rows[0] as any)?.data ?? null
      notify(stream, group, item, 'delete', null)
      return { old_value: old }
    },
    async list(stream: string, group: string) {
      const rows = await sql`
        SELECT item_id, data FROM "_iii_stream"
        WHERE stream_name = ${stream} AND group_id = ${group}
        ORDER BY item_id
      `
      const items = (rows as any[]).map(r => ({
        item_id: r.item_id,
        data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      }))
      return { items }
    },
    async list_groups(stream: string) {
      const rows = await sql`
        SELECT DISTINCT group_id FROM "_iii_stream"
        WHERE stream_name = ${stream}
        ORDER BY group_id
      `
      return { groups: (rows as any[]).map(r => r.group_id) }
    },
    async list_all() {
      const rows = await sql`
        SELECT stream_name, COUNT(DISTINCT group_id) as group_count, COUNT(*) as item_count
        FROM "_iii_stream"
        GROUP BY stream_name
        ORDER BY stream_name
      `
      const streams = (rows as any[]).map(r => ({
        stream_name: r.stream_name,
        group_count: Number(r.group_count),
        item_count: Number(r.item_count),
      }))
      return { streams, count: streams.length }
    },
    async send(stream: string, group: string, type: string, data: unknown, id?: string) {
      notify(stream, group, id ?? '', 'send', { type, data })
    },
    async update(stream: string, group: string, item: string, ops: StreamUpdateOp[]) {
      const { value: oldVal } = await this.get(stream, group, item)
      const newVal = applyOps(oldVal, ops)
      await sql`
        INSERT INTO "_iii_stream" (stream_name, group_id, item_id, data)
        VALUES (${stream}, ${group}, ${item}, ${newVal as any})
        ON CONFLICT (stream_name, group_id, item_id)
        DO UPDATE SET data = ${newVal as any}, updated_at = NOW()
      `
      notify(stream, group, item, 'update', newVal)
      return { old_value: oldVal, new_value: deepClone(newVal) }
    },
  }
}

function createRedisStore(redis: Redis, ttl?: number) {
  function hashKey(stream: string, group: string) {
    return `iii:stream:${stream}:${group}`
  }

  function setTTL(hk: string) {
    if (ttl) redis.expire(hk, ttl)
  }

  return {
    async set(stream: string, group: string, item: string, data: unknown) {
      const hk = hashKey(stream, group)
      const oldRaw = await redis.hget(hk, item)
      let old: unknown = oldRaw ? JSON.parse(oldRaw) : null
      await redis.hset(hk, item, JSON.stringify(data))
      setTTL(hk)
      await redis.publish(`iii:stream:${stream}`, JSON.stringify({ event: 'set', group, item, data }))
      notify(stream, group, item, 'set', data)
      return { old_value: old, new_value: deepClone(data) }
    },
    async get(stream: string, group: string, item: string) {
      const raw = await redis.hget(hashKey(stream, group), item)
      return { value: raw ? JSON.parse(raw) : null }
    },
    async delete(stream: string, group: string, item: string) {
      const hk = hashKey(stream, group)
      const oldRaw = await redis.hget(hk, item)
      const old = oldRaw ? JSON.parse(oldRaw) : null
      await redis.hdel(hk, item)
      const remaining = await redis.hlen(hk)
      if (remaining === 0) await redis.del(hk)
      await redis.publish(`iii:stream:${stream}`, JSON.stringify({ event: 'delete', group, item }))
      notify(stream, group, item, 'delete', null)
      return { old_value: old }
    },
    async list(stream: string, group: string) {
      const raw = await redis.hgetall(hashKey(stream, group))
      const items = Object.entries(raw).map(([item_id, data]) => ({
        item_id,
        data: JSON.parse(data),
      }))
      return { items }
    },
    async list_groups(stream: string) {
      const pattern = `iii:stream:${stream}:*`
      let cursor = '0'
      const groups = new Set<string>()
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000')
        cursor = next
        for (const k of keys) {
          const parts = k.split(':')
          const g = parts.slice(3).join(':')
          if (g) groups.add(g)
        }
      } while (cursor !== '0')
      return { groups: Array.from(groups) }
    },
    async list_all() {
      const pattern = 'iii:stream:*'
      let cursor = '0'
      const streamMap = new Map<string, { groups: Set<string>; items: number }>()
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000')
        cursor = next
        for (const k of keys) {
          const parts = k.split(':')
          const s = parts[2]
          const g = parts.slice(3).join(':')
          if (!streamMap.has(s)) streamMap.set(s, { groups: new Set(), items: 0 })
          const entry = streamMap.get(s)!
          if (g) entry.groups.add(g)
          entry.items++
        }
      } while (cursor !== '0')
      const streams = Array.from(streamMap.entries()).map(([name, info]) => ({
        stream_name: name,
        group_count: info.groups.size,
        item_count: info.items,
      }))
      return { streams, count: streams.length }
    },
    async send(stream: string, group: string, type: string, data: unknown, id?: string) {
      notify(stream, group, id ?? '', 'send', { type, data })
    },
    async update(stream: string, group: string, item: string, ops: StreamUpdateOp[]) {
      const hk = hashKey(stream, group)
      const oldRaw = await redis.hget(hk, item)
      const old = oldRaw ? JSON.parse(oldRaw) : null
      const newVal = applyOps(old, ops)
      await redis.hset(hk, item, JSON.stringify(newVal))
      setTTL(hk)
      await redis.publish(`iii:stream:${stream}`, JSON.stringify({ event: 'update', group, item, data: newVal }))
      notify(stream, group, item, 'update', newVal)
      return { old_value: old, new_value: deepClone(newVal) }
    },
  }
}

export function createStream(opts?: { pg?: PostgresClient; redis?: Redis; streamTTL?: number }) {
  const store = opts?.pg
    ? createPgStore(opts.pg)
    : opts?.redis
      ? createRedisStore(opts.redis, opts.streamTTL ?? 3600)
      : createMemoryStore()

  let redisSub: Redis | null = null

  if (opts?.redis) {
    redisSub = opts.redis.duplicate()
    redisSub.on('message', (rawChannel: string, rawData: string) => {
      if (!rawChannel.startsWith('iii:stream:')) return
      const stream = rawChannel.slice('iii:stream:'.length)
      try {
        const msg = JSON.parse(rawData)
        if (msg.event === 'set' || msg.event === 'update') {
          notify(stream, msg.group, msg.item, msg.event, msg.data)
        } else if (msg.event === 'delete') {
          notify(stream, msg.group, msg.item, 'delete', null)
        }
      } catch {}
    })
  }

  return {

    ...store,

    subscribe(ws: WebSocket, sub: StreamSubscription) {
      const key = sub.item_id
        ? `${sub.stream_name}:${sub.group_id}:${sub.item_id}`
        : sub.group_id
          ? `${sub.stream_name}:${sub.group_id}`
          : sub.stream_name
      if (!channels.has(key)) channels.set(key, new Set())
      channels.get(key)!.add(ws)
      if (redisSub && sub.stream_name) {
        redisSub.subscribe(`iii:stream:${sub.stream_name}`)
      }
    },

    unsubscribe(ws: WebSocket) {
      for (const [, subs] of channels) subs.delete(ws)
    },

    async migrate() {
      if (opts?.pg) {
        const sql = opts.pg.sql
        await sql`
          CREATE TABLE IF NOT EXISTS "_iii_stream" (
            stream_name TEXT NOT NULL,
            group_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            data JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (stream_name, group_id, item_id)
          )
        `
        await sql`CREATE INDEX IF NOT EXISTS idx_iii_stream_group ON "_iii_stream" (stream_name, group_id)`
      }
    },
  }
}
