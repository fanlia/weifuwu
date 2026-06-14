/**
 * Test setup: registers happy-dom globals before any tests run.
 * Import this first in tests that need a DOM environment.
 */
import { Window } from 'happy-dom'

const win = new Window()

// Polyfill all Window properties onto globalThis
const winProps = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(win))
for (const [key, desc] of Object.entries(winProps)) {
  if (desc.get && !(key in globalThis)) {
    Object.defineProperty(globalThis, key, {
      get: () => (win as any)[key],
      set: (v: unknown) => {
        ;(win as any)[key] = v
      },
      configurable: true,
    })
  }
}

// Static properties that aren't on the prototype
for (const key of Object.getOwnPropertyNames(win) as (keyof typeof win)[]) {
  if (!(key in globalThis)) {
    ;(globalThis as any)[key] = (win as any)[key]
  }
}

// ── Mock WebSocket ──────────────────────────────────────────────────────────
// Tests can access the created mock via (globalThis as any).__lastMockWs

export interface MockWebSocket {
  readyState: number
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  send: (data: string) => void
  close: () => void
  /** Simulate receiving a message from the server. */
  simulateMessage(data: string): void
  /** Simulate the connection opening. */
  simulateOpen(): void
  /** Simulate the connection closing. */
  simulateClose(): void
}

class MockWebSocketImpl implements MockWebSocket {
  readyState = 0 // CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  private _closed = false
  private _listeners: Record<string, Set<(ev: any) => void>> = {}

  constructor(_url: string) {
    // Store reference for test access
    ;(globalThis as any).__lastMockWs = this
  }

  addEventListener(event: string, handler: (ev: any) => void): void {
    if (!this._listeners[event]) this._listeners[event] = new Set()
    this._listeners[event]!.add(handler)
  }

  removeEventListener(event: string, handler: (ev: any) => void): void {
    this._listeners[event]?.delete(handler)
  }

  private _emit(event: string, ev: any): void {
    this._listeners[event]?.forEach((h) => h(ev))
    const onField = ('on' + event) as keyof this
    const handler = this[onField] as ((ev: any) => void) | null
    handler?.(ev)
  }

  send(_data: string): void {
    // No-op in tests
  }

  close(): void {
    this._closed = true
    this.readyState = 3 // CLOSED
    this._emit('close', new CloseEvent('close'))
  }

  /** Simulate the WebSocket connection opening. Call this before testing messages. */
  connect(): void {
    if (this._closed) return
    this.readyState = 1 // OPEN
    this._emit('open', new Event('open'))
  }

  simulateMessage(data: string): void {
    const event = new MessageEvent('message', { data })
    this._emit('message', event)
  }
}

// Replace global WebSocket with mock
;(globalThis as any).WebSocket = MockWebSocketImpl
