import { useEffect, useRef, useCallback, useState } from 'react'

const RECONNECT_DELAY = 3000
const MAX_RETRIES = 10

/** Options for {@link useWebsocket}. */
export type UseWebsocketOptions = {
  /** Called when a message is received. */
  onMessage?: (data: string) => void
  /** Auto-reconnect config. Set to `false` to disable. Default: `{ maxRetries: 10, delay: 3000 }`. */
  reconnect?: boolean | { maxRetries?: number; delay?: number }
  /** WebSocket sub-protocols. */
  protocols?: string | string[]
  /** Whether the WebSocket is enabled. Set to `false` to keep closed. Default: `true`. */
  enabled?: boolean
}

/** Return value of {@link useWebsocket}. */
export type UseWebsocketReturn = {
  /** Send data through the WebSocket. */
  send: (data: string | ArrayBuffer | Blob) => void
  /** Close the WebSocket manually. */
  close: () => void
  /** Current `WebSocket.readyState`. */
  readyState: number
  /** The last received message string. */
  lastMessage: string | null
  /** Manually trigger reconnection. */
  reconnect: () => void
}

function resolveUrl(url: string | URL | (() => string | URL | null)): string | URL | null {
  return typeof url === 'function' ? url() : url
}

/**
 * React hook for WebSocket connections with auto-reconnect.
 *
 * ```tsx
 * import { useWebsocket } from 'weifuwu/react'
 *
 * function Chat() {
 *   const { send, lastMessage, readyState } = useWebsocket('/ws/chat', {
 *     onMessage: (data) => console.log('received:', data),
 *   })
 *   return <button onClick={() => send('Hello')}>Send</button>
 * }
 * ```
 */
export function useWebsocket(
  url: string | URL | (() => string | URL | null),
  options?: UseWebsocketOptions,
): UseWebsocketReturn {
  const { onMessage, reconnect: reconnectOpt = true, protocols, enabled = true } = options ?? {}

  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED)

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  const shouldReconnectRef = useRef(true)
  const urlRef = useRef(url)
  const optsRef = useRef({ onMessage, reconnectOpt, protocols })
  urlRef.current = url
  optsRef.current = { onMessage, reconnectOpt, protocols }

  const cleanup = useCallback(() => {
    clearTimeout(timerRef.current)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return
    const resolved = resolveUrl(urlRef.current)
    if (!resolved) return

    wsRef.current?.close()
    const ws = new WebSocket(resolved, optsRef.current.protocols)
    wsRef.current = ws
    setReadyState(WebSocket.CONNECTING)

    ws.addEventListener('open', () => {
      if (!mountedRef.current) return
      retryRef.current = 0
      setReadyState(WebSocket.OPEN)
    })

    ws.addEventListener('message', (e: MessageEvent) => {
      if (!mountedRef.current) return
      const data = typeof e.data === 'string' ? e.data : String(e.data)
      setLastMessage(data)
      optsRef.current.onMessage?.(data)
    })

    ws.addEventListener('close', () => {
      if (!mountedRef.current) return
      setReadyState(WebSocket.CLOSED)

      const ro = optsRef.current.reconnectOpt
      if (ro && shouldReconnectRef.current && mountedRef.current) {
        const maxRetries = typeof ro === 'object' ? ro.maxRetries ?? MAX_RETRIES : MAX_RETRIES
        const delay = typeof ro === 'object' ? ro.delay ?? RECONNECT_DELAY : RECONNECT_DELAY
        if (retryRef.current < maxRetries) {
          retryRef.current++
          timerRef.current = setTimeout(() => connect(), delay)
        }
      }
    })
  }, [enabled])

  useEffect(() => {
    mountedRef.current = true
    shouldReconnectRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [enabled, connect, cleanup])

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    wsRef.current?.send(data)
  }, [])

  const close = useCallback(() => {
    shouldReconnectRef.current = false
    cleanup()
    setReadyState(WebSocket.CLOSED)
  }, [cleanup])

  const reconnectFn = useCallback(() => {
    retryRef.current = 0
    shouldReconnectRef.current = true
    cleanup()
    connect()
  }, [cleanup, connect])

  return { send, close, readyState, lastMessage, reconnect: reconnectFn }
}
