import crypto from 'node:crypto'
import type { Context, Middleware, Closeable } from './types.ts'
import type { Redis } from './vendor.ts'

// ── Types ───────────────────────────────────────────────────────────────────

export interface CachedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  createdAt: number
  tags: string[]
}

export interface CacheStore {
  get(key: string): Promise<CachedResponse | null>
  set(key: string, entry: CachedResponse, ttl: number): Promise<void>
  delete(key: string): Promise<void>
  invalidate(tag: string): Promise<void>
  flush(): Promise<void>
}

export interface CacheOptions {
  /** TTL in milliseconds. Default: 300_000 (5 min). */
  ttl?: number
  /** Cache store. 'memory' (default) or 'redis'. */
  store?: 'memory' | 'redis' | CacheStore
  /** Redis client (required when store: 'redis'). */
  redis?: Redis
  /** Custom cache key function. Default: SHA256 of method + URL. */
  key?: (req: Request) => string
  /** Tag function for grouped invalidation. Called after handler runs (ctx available). */
  tag?: (req: Request, ctx: Context) => string | string[] | undefined
  /** Whether to cache responses with Set-Cookie. Default: false. */
  cacheCookies?: boolean
  /** Status codes to cache. Default: [200]. */
  cacheStatus?: number[]
  /** Maximum number of bytes per cached body. Default: 1MB. Larger bodies are skipped. */
  maxBodySize?: number
}

export interface CacheMiddleware extends Middleware, Closeable {
  /** Invalidate all entries with a given tag. */
  invalidate(tag: string): Promise<void>
  /** Flush all cached entries. */
  flush(): Promise<void>
  /** Cleanup. */
  close(): void
  /** Store reference (for testing). */
  store: CacheStore
}

// ── Binary content types that should not be cached as text ──────────────────

const BINARY_PREFIXES = [
  'image/', 'audio/', 'video/', 'application/octet-stream',
  'application/pdf', 'application/zip', 'application/gzip',
  'application/x-tar', 'application/vnd.ms-',
  'application/vnd.openxmlformats-',
]

function isCacheableContentType(ct: string): boolean {
  return !BINARY_PREFIXES.some(p => ct.startsWith(p))
}

function isCacheableStatus(status: number, allowed: number[]): boolean {
  return allowed.includes(status)
}

function defaultCacheKey(req: Request): string {
  const hash = crypto.createHash('sha256')
  hash.update(req.method)
  hash.update(req.url)
  return hash.digest('hex')
}

// ── MemoryCache ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 100_000

export class MemoryCache implements CacheStore {
  private store = new Map<string, { data: CachedResponse; expires: number }>()
  private tagIndex = new Map<string, Set<string>>()
  private interval: ReturnType<typeof setInterval>

  constructor(cleanupMs = 60_000) {
    this.interval = setInterval(() => this.cleanup(), cleanupMs)
    if (this.interval.unref) this.interval.unref()
  }

  async get(key: string): Promise<CachedResponse | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expires) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  async set(key: string, data: CachedResponse, ttl: number): Promise<void> {
    if (this.store.size >= MAX_ENTRIES) {
      const oldest = this.store.keys().next()
      if (!oldest.done) this.store.delete(oldest.value)
    }
    this.store.set(key, { data, expires: Date.now() + ttl })

    // Index by tag
    for (const tag of data.tags) {
      let set = this.tagIndex.get(tag)
      if (!set) {
        set = new Set()
        this.tagIndex.set(tag, set)
      }
      set.add(key)
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
    // Clean up tag index
    for (const [, set] of this.tagIndex) {
      set.delete(key)
    }
  }

  async invalidate(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag)
    if (!keys) return
    for (const key of keys) {
      this.store.delete(key)
    }
    this.tagIndex.delete(tag)
  }

  async flush(): Promise<void> {
    this.store.clear()
    this.tagIndex.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expires < now) {
        this.store.delete(key)
        // Clean up tag index
        for (const [, set] of this.tagIndex) {
          set.delete(key)
        }
      }
    }
  }

  close(): void {
    clearInterval(this.interval)
    this.store.clear()
    this.tagIndex.clear()
  }

  /** Testing only. */
  get size(): number { return this.store.size }
}

// ── RedisCache ──────────────────────────────────────────────────────────────

export class RedisCache implements CacheStore {
  private redis: Redis
  private prefix: string
  private tagPrefix: string

  constructor(redis: Redis, prefix = 'cache:') {
    this.redis = redis
    this.prefix = prefix
    this.tagPrefix = `${prefix}tag:`
  }

  private key(sid: string): string { return `${this.prefix}${sid}` }
  private tagKey(tag: string): string { return `${this.tagPrefix}${tag}` }

  async get(key: string): Promise<CachedResponse | null> {
    const raw = await this.redis.get(this.key(key))
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      await this.redis.del(this.key(key))
      return null
    }
  }

  async set(key: string, entry: CachedResponse, ttl: number): Promise<void> {
    const multi = this.redis.multi()
    multi.psetex(this.key(key), ttl, JSON.stringify(entry))

    // Index by tag (PTTL/EXPIRE with seconds approximation for tag sets)
    const ttlSec = Math.ceil(ttl / 1000)
    for (const tag of entry.tags) {
      multi.sadd(this.tagKey(tag), key)
      multi.expire(this.tagKey(tag), ttlSec)
    }

    await multi.exec()
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key))
  }

  async invalidate(tag: string): Promise<void> {
    const key = this.tagKey(tag)
    // Read all cache keys for this tag
    const members = await this.redis.smembers(key)
    if (members.length > 0) {
      // Delete all cache keys + the tag set
      await this.redis.del(key, ...members.map((m: string) => this.key(m)))
    }
  }

  async flush(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}*`)
    if (keys.length > 0) await this.redis.del(...keys)
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

const DEFAULT_TTL = 300_000 // 5 minutes
const DEFAULT_MAX_BODY = 1024 * 1024 // 1MB

function shouldSkipCache(req: Request): boolean {
  // Only cache GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') return true
  // Skip authenticated requests (privacy)
  if (req.headers.get('authorization')) return true
  if (req.headers.get('cookie')) return true
  return false
}

export function cache(options?: CacheOptions): CacheMiddleware {
  const ttl = options?.ttl ?? DEFAULT_TTL
  const cacheStatus = options?.cacheStatus ?? [200]
  const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY
  const getKey = options?.key ?? defaultCacheKey
  const getTag = options?.tag
  const cacheCookies = options?.cacheCookies ?? false

  // Resolve store
  let store: CacheStore
  let closeStore: (() => void) | null = null

  if (options?.store && typeof (options.store as CacheStore).get === 'function') {
    store = options.store as CacheStore
  } else if (options?.store === 'redis') {
    if (!options.redis) throw new Error('cache: redis client required when store: "redis"')
    store = new RedisCache(options.redis)
  } else {
    const mem = new MemoryCache()
    store = mem
    closeStore = () => mem.close()
  }

  const mw = (async (req: Request, ctx: Context, next: any) => {
    // Check if this request can/should be cached
    if (shouldSkipCache(req)) {
      return next(req, ctx)
    }

    const cacheKey = getKey(req)

    // Try cache hit
    const cached = await store.get(cacheKey)
    if (cached) {
      const age = Math.floor((Date.now() - cached.createdAt) / 1000)
      const headers = new Headers(cached.headers)
      headers.set('Age', String(age))
      headers.set('X-Cache', 'HIT')
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      })
    }

    // Cache miss — run handler
    const res = await next(req, ctx)

    // Check if response is cacheable
    if (!isCacheableStatus(res.status, cacheStatus)) return res
    if (res.headers.get('set-cookie') && !cacheCookies) return res
    if (res.headers.get('cache-control')?.includes('no-store')) return res

    // Don't cache streaming responses
    if (res.body && res.headers.get('content-type')?.includes('text/event-stream')) return res

    // Read body as text (skip binary content types)
    const ct = res.headers.get('content-type') ?? ''
    if (!isCacheableContentType(ct)) return res

    // Clone and read body
    const clone = res.clone()
    const bodyText = await clone.text()
    if (bodyText.length > maxBodySize) return res

    // Collect tags
    const tags: string[] = []
    if (getTag) {
      const result = getTag(req, ctx)
      if (result) {
        if (Array.isArray(result)) tags.push(...result)
        else tags.push(result)
      }
    }

    // Serialize headers
    const headers: Record<string, string> = {}
    res.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() === 'set-cookie' && !cacheCookies) return
      headers[key] = value
    })

    const entry: CachedResponse = {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: bodyText,
      createdAt: Date.now(),
      tags,
    }

    // Store — await to ensure subsequent requests find the cached entry
    await store.set(cacheKey, entry, ttl)

    return res
  }) as unknown as CacheMiddleware

  mw.store = store
  mw.invalidate = async (tag: string) => store.invalidate(tag)
  mw.flush = async () => store.flush()
  mw.close = () => { closeStore?.() }

  return mw
}
