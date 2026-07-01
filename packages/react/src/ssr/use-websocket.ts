import { useEffect, useRef, useCallback, useState } from 'react'

const RECONNECT_DELAY = 3000
const MAX_RETRIES = 10

export type UseWebsocketOptions = {
  onMessage?: (data: string) => void
  reconnect?: boolean | { maxRetries?: number; delay?: number }
  protocols?: string | string[]
  enabled?: boolean
}

export type UseWebsocketReturn = {
  send: (data: string | ArrayBuffer | Blob) => void
  close: () => void
  readyState: number
  lastMessage: string | null
  reconnect: () => void
}

function resolveUrl(url: string | URL | (() => string | URL | null)): string | URL | null {
  return typeof url === 'function' ? url() : url
}

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
        const maxRetries = typeof ro === 'object' ? (ro.maxRetries ?? MAX_RETRIES) : MAX_RETRIES
        const delay = typeof ro === 'object' ? (ro.delay ?? RECONNECT_DELAY) : RECONNECT_DELAY
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
