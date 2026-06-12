import crypto from 'node:crypto'
import type { Context, Handler, Middleware } from './types.ts'
import { Router } from './router.ts'

// ── Types ───────────────────────────────────────────────────────────────────

export interface WebhookEvent {
  /** Raw event name from the provider (e.g. 'checkout.session.completed') */
  event: string
  /** Parsed event payload */
  payload: unknown
  /** Provider name (e.g. 'stripe', 'github') */
  provider: string
  /** Unique event ID for replay protection */
  id?: string
}

export interface WebhookHandler {
  (event: WebhookEvent, ctx: Context): void | Promise<void>
}

export interface PlatformConfig {
  /** HMAC-SHA256 secret */
  secret: string
  /** Optional custom event prefix (default: platform name) */
  prefix?: string
}

export interface CustomVerifierConfig {
  /** Name for this verifier */
  name: string
  /** Verify function. Return true if signature is valid. */
  verify: (body: string, headers: Record<string, string>) => boolean | Promise<boolean>
  /** Extract event name from body and headers */
  event: (body: unknown, headers: Record<string, string>) => string
}

export interface WebhookOptions {
  /** Stripe webhook config (enables Stripe signature verification) */
  stripe?: PlatformConfig
  /** GitHub webhook config */
  github?: PlatformConfig
  /** Slack webhook config */
  slack?: PlatformConfig
  /** Custom verifiers */
  custom?: CustomVerifierConfig[]
  /** Global prefix for all event types (default: none) */
  prefix?: string
  /** Path to mount the webhook receiver. Default: '/'. */
  path?: string
  /** Enable replay protection (requires provider to send unique event IDs). Default: true. */
  replayProtection?: boolean
  /** Idempotency key TTL in ms. Default: 3600000 (1 hour). */
  idempotencyTTL?: number
}

export interface WebhookModule extends Router {
  /** Register an event handler */
  on(event: string, handler: WebhookHandler): this
  /** Remove an event handler */
  off(event: string, handler: WebhookHandler): this
}

// ── Signature verifiers ─────────────────────────────────────────────────────

interface VerifierResult {
  valid: boolean
  provider: string
  event: string
  id?: string
}

type Verifier = (body: string, headers: Record<string, string>) => VerifierResult | Promise<VerifierResult>

function timingSafeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

function createStripeVerifier(config: PlatformConfig): Verifier {
  return (body: string, headers: Record<string, string>) => {
    const sigHeader = headers['stripe-signature']
    if (!sigHeader) return { valid: false, provider: 'stripe', event: '', id: undefined }

    // Parse the signature header: t=timestamp,v1=signature,v0=signature
    const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, p) => {
      const [k, ...v] = p.split('=')
      if (k) acc[k.trim()] = v.join('=').trim()
      return acc
    }, {})

    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return { valid: false, provider: 'stripe', event: '', id: undefined }

    const signed = `${timestamp}.${body}`
    const expected = crypto.createHmac('sha256', config.secret).update(signed).digest('hex')
    const valid = timingSafeEqual(signature, expected)

    // Extract event type from body
    let event = ''
    let id: string | undefined
    try {
      const parsed = JSON.parse(body)
      event = parsed.type ?? ''
      id = parsed.id
    } catch {}

    return { valid, provider: 'stripe', event, id }
  }
}

function createGitHubVerifier(config: PlatformConfig): Verifier {
  return (body: string, headers: Record<string, string>) => {
    const sig = headers['x-hub-signature-256']
    if (!sig) return { valid: false, provider: 'github', event: '', id: undefined }

    const expected = `sha256=${crypto.createHmac('sha256', config.secret).update(body).digest('hex')}`
    const valid = timingSafeEqual(sig, expected)

    let event = headers['x-github-event'] ?? ''
    let id: string | undefined
    try {
      const parsed = JSON.parse(body)
      id = headers['x-github-delivery'] || parsed.id
    } catch {}

    return { valid, provider: 'github', event, id }
  }
}

function createSlackVerifier(config: PlatformConfig): Verifier {
  return (body: string, headers: Record<string, string>) => {
    const signature = headers['x-slack-signature']
    const timestamp = headers['x-slack-request-timestamp']
    if (!signature || !timestamp) return { valid: false, provider: 'slack', event: '', id: undefined }

    // Reject requests older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000)
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return { valid: false, provider: 'slack', event: '', id: undefined }
    }

    const sigBase = `v0:${timestamp}:${body}`
    const expected = `v0=${crypto.createHmac('sha256', config.secret).update(sigBase).digest('hex')}`
    const valid = timingSafeEqual(signature, expected)

    let event = ''
    let id: string | undefined
    try {
      const parsed = JSON.parse(body)
      event = parsed.event?.type ?? parsed.type ?? (parsed.challenge ? 'url_verification' : '')
      id = parsed.event_id || parsed.ssl?.event_id
    } catch {}

    return { valid, provider: 'slack', event, id }
  }
}

// ── In-memory idempotency store ────────────────────────────────────────────

class IdempotencyStore {
  private store = new Map<string, number>()
  private ttl: number

  constructor(ttl: number) {
    this.ttl = ttl
  }

  /** Returns true if this event ID has already been processed. */
  isDuplicate(id: string): boolean {
    if (this.store.has(id)) return true
    this.store.set(id, Date.now())
    return false
  }

  /** Periodic cleanup */
  cleanup(): void {
    const now = Date.now()
    for (const [key, ts] of this.store) {
      if (now - ts > this.ttl) this.store.delete(key)
    }
  }
}

// ── Event emitter ──────────────────────────────────────────────────────────

class EventBus {
  private handlers = new Map<string, Set<WebhookHandler>>()

  on(event: string, handler: WebhookHandler): void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
  }

  off(event: string, handler: WebhookHandler): void {
    const set = this.handlers.get(event)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) this.handlers.delete(event)
  }

  async emit(event: string, payload: unknown, provider: string, id: string | undefined, ctx: Context): Promise<void> {
    const we = { event, payload, provider, id }

    // Emit to specific event
    const specific = this.handlers.get(event)
    if (specific) {
      for (const handler of specific) {
        await handler(we, ctx)
      }
    }

    // Emit to wildcard '*'
    const wildcard = this.handlers.get('*')
    if (wildcard) {
      for (const handler of wildcard) {
        await handler(we, ctx)
      }
    }
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

export function webhook(options?: WebhookOptions): WebhookModule {
  const replayProtection = options?.replayProtection ?? true
  const idempotencyTTL = options?.idempotencyTTL ?? 3_600_000
  const mountPath = options?.path ?? '/'

  const verifiers: Verifier[] = []
  if (options?.stripe) verifiers.push(createStripeVerifier(options.stripe))
  if (options?.github) verifiers.push(createGitHubVerifier(options.github))
  if (options?.slack) verifiers.push(createSlackVerifier(options.slack))
  if (options?.custom) {
    for (const c of options.custom) {
      verifiers.push(async (body, headers) => {
        const valid = await c.verify(body, headers)
        let event = ''
        try {
          event = c.event(JSON.parse(body), headers)
        } catch {}
        return { valid, provider: c.name, event, id: undefined }
      })
    }
  }

  const bus = new EventBus()
  const idempotency = new IdempotencyStore(idempotencyTTL)
  const cleanupInterval = setInterval(() => idempotency.cleanup(), 60_000)
  if (cleanupInterval.unref) cleanupInterval.unref()

  const router = new Router()

  // POST handler — receives webhooks
  const handler: Handler = async (req, ctx) => {
    const body = await req.text()
    if (!body) {
      return new Response('Empty body', { status: 400 })
    }

    // Collect headers
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => { headers[k] = v })

    // Try each verifier
    for (const verify of verifiers) {
      const result = await verify(body, headers)
      if (!result.valid) continue

      // Signature valid — check replay protection
      if (replayProtection && result.id) {
        if (idempotency.isDuplicate(result.id)) {
          // Already processed — return 200 to acknowledge receipt
          return new Response('OK', { status: 200 })
        }
      }

      // Parse payload
      let payload: unknown
      try {
        payload = JSON.parse(body)
      } catch {
        return new Response('Invalid JSON body', { status: 400 })
      }

      // Handle Slack URL verification specially (needs challenge response)
      if (result.provider === 'slack' && (payload as any)?.challenge) {
        return new Response(JSON.stringify({ challenge: (payload as any).challenge }), {
          headers: { 'content-type': 'application/json' },
        })
      }

      // Fire handlers (async, don't block response)
      // We await them to surface errors as 500
      try {
        await bus.emit(result.event, payload, result.provider, result.id, ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[webhook] handler error for ${result.provider}.${result.event}: ${msg}`)
        return new Response('Handler error', { status: 500 })
      }

      return new Response('OK', { status: 200 })
    }

    // No verifier matched
    return new Response('Unauthorized', { status: 401 })
  }

  router.post(mountPath, handler)

  const mod = router as unknown as WebhookModule
  mod.on = (event: string, handler: WebhookHandler) => { bus.on(event, handler); return mod }
  mod.off = (event: string, handler: WebhookHandler) => { bus.off(event, handler); return mod }

  // Store cleanup reference
  ;(mod as any)._cleanup = () => {
    clearInterval(cleanupInterval)
  }

  return mod
}
