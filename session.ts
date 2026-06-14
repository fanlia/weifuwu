import crypto from 'node:crypto'
import type { Context, Middleware } from './types.ts'
import { getCookies, setCookie, deleteCookie } from './cookie.ts'
import type { Redis } from './vendor.ts'
import type { Closeable } from './types.ts'

// Augment Context with session properties
declare module './types.ts' {
  interface Context {
    session: Session
  }
}

// ── Symbols for internal session state ──────────────────────────────────────
const kSaved = Symbol('session.saved')
const kDestroyed = Symbol('session.destroyed')
const kId = Symbol('session.id')
const kStore = Symbol('session.store')
const kTtl = Symbol('session.ttl')

// ── Session type ────────────────────────────────────────────────────────────

export interface SessionData {
  [key: string]: unknown
}

/** The session object injected into ctx.session. Plain data + control methods. */
export interface Session extends SessionData {
  /** Mark session as modified. Auto-detected on mutation, but call explicitly for deep mutations. */
  save(): void
  /** Destroy session. Clears data and removes from store on response. */
  destroy(): void
  /** Session ID (readonly). */
  readonly id: string
  [kSaved]: boolean
  [kDestroyed]: boolean
  [kId]: string
  [kStore]: SessionStore
  [kTtl]: number
}

// ── SessionStore interface ──────────────────────────────────────────────────

export interface SessionStore extends Closeable {
  get(sid: string): Promise<Record<string, unknown> | null>
  set(sid: string, data: Record<string, unknown>, ttl: number): Promise<void>
  destroy(sid: string): Promise<void>
  /** Release resources. Default no-op. */
  close(): Promise<void>
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface SessionOptions {
  /** Session store. 'memory' (default) or 'redis'. */
  store?: 'memory' | 'redis' | SessionStore
  /** Redis client (required when store: 'redis'). */
  redis?: Redis
  /** Session TTL in milliseconds. Default: 24 hours. */
  ttl?: number
  /** Cookie name. Default: '__session'. */
  cookieName?: string
  /** Cookie options. */
  cookie?: {
    path?: string
    domain?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
  }
  /**
   * Secret for signing the session cookie with HMAC-SHA256.
   * When set, the cookie value becomes `sid.signature` — tampering is detected
   * and rejected. Strongly recommended in production.
   */
  secret?: string
  /**
   * Interval (ms) for automatic session ID rotation.
   * Rotating the ID mitigates session fixation attacks.
   * Default: 900_000 (15 min). Set to 0 to disable.
   */
  rotateInterval?: number
}

export interface SessionInjected {
  session: Session
  sessionId: string
}

// ── MemoryStore ─────────────────────────────────────────────────────────────

const MAX_SESSIONS = 100_000

export class MemoryStore implements SessionStore {
  private store = new Map<string, { data: Record<string, unknown>; expires: number }>()
  private interval: ReturnType<typeof setInterval>

  constructor(cleanupMs = 60_000) {
    this.interval = setInterval(() => this.cleanup(), cleanupMs)
    if (this.interval.unref) this.interval.unref()
  }

  async get(sid: string): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(sid)
    if (!entry) return null
    if (Date.now() > entry.expires) {
      this.store.delete(sid)
      return null
    }
    return entry.data
  }

  async set(sid: string, data: Record<string, unknown>, ttl: number): Promise<void> {
    // Evict oldest if over cap
    if (this.store.size >= MAX_SESSIONS) {
      const oldest = this.store.keys().next()
      if (!oldest.done) this.store.delete(oldest.value)
    }
    this.store.set(sid, { data, expires: Date.now() + ttl })
  }

  async destroy(sid: string): Promise<void> {
    this.store.delete(sid)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expires < now) this.store.delete(key)
    }
  }

  async close(): Promise<void> {
    clearInterval(this.interval)
    this.store.clear()
  }

  /** Testing only: return approximate count. */
  get size(): number { return this.store.size }
}

// ── RedisStore ──────────────────────────────────────────────────────────────

export class RedisStore implements SessionStore {
  private redis: Redis
  private prefix: string

  constructor(redis: Redis, prefix = 'session:') {
    this.redis = redis
    this.prefix = prefix
  }

  private key(sid: string): string {
    return `${this.prefix}${sid}`
  }

  async get(sid: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis.get(this.key(sid))
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      await this.redis.del(this.key(sid))
      return null
    }
  }

  async set(sid: string, data: Record<string, unknown>, ttl: number): Promise<void> {
    const ttlSec = Math.ceil(ttl / 1000)
    await this.redis.setex(this.key(sid), ttlSec, JSON.stringify(data))
  }

  async destroy(sid: string): Promise<void> {
    await this.redis.del(this.key(sid))
  }

  async close(): Promise<void> {
    this.redis.disconnect()
  }
}

// ── Cookie signing ────────────────────────────────────────────────────────────

const COOKIE_SEPARATOR = '.'

function signSessionId(sid: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(sid).digest('base64url').slice(0, 16)
  return sid + COOKIE_SEPARATOR + hmac
}

function unsignSessionId(value: string, secret: string): string | null {
  const dot = value.lastIndexOf(COOKIE_SEPARATOR)
  if (dot === -1) return null
  const sid = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(sid).digest('base64url').slice(0, 16)
  if (sig.length !== expected.length) return null
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? sid : null
  } catch {
    return null
  }
}

// ── Internal metadata keys (prefixed to avoid collision with user data) ─────

const kCreatedAt = '__createdAt'

// ── Helpers ─────────────────────────────────────────────────────────────────

function createSessionObject(
  data: Record<string, unknown> | null,
  sid: string,
  store: SessionStore,
  ttl: number,
  createdAt?: number,
): Session {
  const obj = (data ?? {}) as Session
  obj[kSaved] = false
  obj[kDestroyed] = false
  obj[kId] = sid
  obj[kStore] = store
  obj[kTtl] = ttl
  // Stamp __createdAt on the object so it survives JSON roundtrip
  if (createdAt) obj[kCreatedAt] = createdAt
  obj.save = () => { obj[kSaved] = true }
  obj.destroy = () => {
    obj[kDestroyed] = true
    obj[kSaved] = false
    // Clear all data keys
    for (const key of Object.keys(obj)) {
      if (typeof key === 'symbol') continue
      delete obj[key as keyof typeof obj]
    }
  }
  Object.defineProperty(obj, 'id', {
    get: () => obj[kId],
    enumerable: false,
    configurable: false,
  })
  Object.defineProperty(obj, 'save', { enumerable: false, configurable: true, writable: true, value: obj.save })
  Object.defineProperty(obj, 'destroy', { enumerable: false, configurable: true, writable: true, value: obj.destroy })
  return obj
}

function isSessionActive(session: Session): boolean {
  // A session is "active" if it has at least one data key (non-symbol, non-method)
  for (const key of Object.keys(session)) {
    if (key !== 'save' && key !== 'destroy') return true
  }
  return false
}

// ── Middleware ──────────────────────────────────────────────────────────────

export function session(options?: SessionOptions): Middleware<Context, Context & SessionInjected> & { close: () => Promise<void>; store: SessionStore } {
  const ttl = options?.ttl ?? 24 * 60 * 60 * 1000
  const cookieName = options?.cookieName ?? '__session'
  const secret = options?.secret
  const rotateInterval = options?.rotateInterval ?? 900_000 // 15 min default
  const cookieOpts = {
    path: options?.cookie?.path ?? '/',
    domain: options?.cookie?.domain,
    httpOnly: options?.cookie?.httpOnly ?? true,
    secure: options?.cookie?.secure ?? (process.env.NODE_ENV === 'production'),
    sameSite: options?.cookie?.sameSite ?? 'lax' as const,
  }

  // Resolve store
  let store: SessionStore
  let closeStore: (() => Promise<void>) | null = null

  // Use duck-type check: SessionStore is an interface, not a class
  if (options?.store && typeof (options.store as SessionStore).get === 'function') {
    store = options.store as SessionStore
  } else if (options?.store === 'redis') {
    if (!options.redis) throw new Error('session: redis client required when store: "redis"')
    store = new RedisStore(options.redis)
    closeStore = () => (store as RedisStore).close()
  } else {
    const mem = new MemoryStore()
    store = mem
    closeStore = () => mem.close()
  }

  function writeCookie(res: Response, sid: string): Response {
    const value = secret ? signSessionId(sid, secret) : sid
    return setCookie(res, cookieName, value, cookieOpts)
  }

  const mw = (async (req: Request, ctx: Context, next: any) => {
    const cookies = getCookies(req)
    const rawSid = cookies[cookieName]

    // Unsign cookie value if secret is configured
    let sid: string | null | undefined
    if (rawSid) {
      sid = secret ? unsignSessionId(rawSid, secret) : rawSid
    }

    let session: Session
    let loadedSid: string | null = sid ?? null
    let needsRotation = false

    if (sid) {
      const data = await store.get(sid)
      if (data) {
        const createdAt = (data[kCreatedAt] as number) ?? Date.now()
        session = createSessionObject(data, sid, store, ttl, createdAt)

        // Check if session ID needs rotation
        if (rotateInterval > 0 && Date.now() - createdAt > rotateInterval) {
          needsRotation = true
        }
      } else {
        // Expired or invalid session — don't write back to corrupted sid
        loadedSid = null
        session = createSessionObject({}, crypto.randomUUID(), store, ttl, Date.now())
      }
    } else {
      // No cookie (or invalid signature when secret is set) — new session
      loadedSid = null
      session = createSessionObject({}, crypto.randomUUID(), store, ttl, Date.now())
    }

    // Take a snapshot before handler runs
    // save/destroy/id are non-enumerable, so they don't appear in JSON.stringify
    const snapshot = isSessionActive(session) ? JSON.stringify(session) : null

    ctx.session = session

    const res = await next(req, ctx)

    // Read session again — handler may have replaced ctx.session entirely
    const currentSession = ctx.session as Session | null | undefined

    if (!currentSession || currentSession[kDestroyed]) {
      // Destroyed
      if (loadedSid) {
        await store.destroy(loadedSid)
      }
      return deleteCookie(res, cookieName, cookieOpts)
    }

    // Check if rotation is needed (session was loaded from store and is old)
    if (needsRotation && loadedSid) {
      const newId = crypto.randomUUID()
      // Copy session data to new ID with updated __createdAt
      const data = JSON.parse(JSON.stringify(currentSession))
      data[kCreatedAt] = Date.now()
      await store.set(newId, data, ttl)
      await store.destroy(loadedSid)
      loadedSid = newId
      // Update session object's internal ID and __createdAt so subsequent
      // snapshot comparison uses the corrected timestamp
      // Update session internals via Symbol keys — not part of Session public API
      Object.assign(currentSession, { [kId]: newId, [kCreatedAt]: data[kCreatedAt] })
    }

    // Check if data changed
    const currentData = isSessionActive(currentSession) ? JSON.stringify(currentSession) : null

    const wasSaved = currentSession[kSaved]
    const changed = wasSaved || needsRotation || (currentData !== snapshot)

    if (!changed) {
      // No changes — just extend TTL if session exists in store
      if (loadedSid && store instanceof RedisStore) {
        await store.set(loadedSid, JSON.parse(currentData ?? '{}'), ttl)
      }
      return res
    }

    if (currentData && currentData !== '{}') {
      // Save/update session
      const targetSid = loadedSid ?? currentSession.id
      const data = JSON.parse(currentData)
      await store.set(targetSid, data, ttl)
      if (!loadedSid) {
        // New session — set signed cookie
        return writeCookie(res, targetSid)
      }
      if (needsRotation) {
        // Rotation changed the SID — update cookie
        return writeCookie(res, targetSid)
      }
    } else if (loadedSid) {
      // Session emptied — destroy
      await store.destroy(loadedSid)
      return deleteCookie(res, cookieName, cookieOpts)
    }

    return res
  }) as Middleware<Context, Context & SessionInjected> & { close: () => Promise<void>; store: SessionStore }

  mw.close = async () => { await closeStore?.() }
  mw.store = store

  return mw
}
