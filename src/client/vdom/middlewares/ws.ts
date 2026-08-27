/**
 * vdom middlewares — ws（WebSocket 客户端——ctx.ws 注入面）
 *
 * 设计：WebSocket 构造经 opts 注入（jsdom 无 WS——测试 mock——
 * 零全局直接访问）；onMessage 订阅（返回退订）；unmount 关闭。
 *
 * 可靠性面（2026-08——A2 消息断线补拉的地基）：
 * - autoReconnect：断线自动重连（指数退避 1s/2s/4s...封顶 maxMs——
 *   onopen 重置计数）——**close() 手动关闭不重连**（主动语义）
 * - onStatusChange：状态翻转通知（onopen/onclose 触发——订阅即回放当前
 *   态——应用层感知「重连成功 → 补拉数据」）
 */

export interface WsReconnectOptions {
  /** 重连基延迟（ms——指数退避起点——默认 1000） */
  baseMs?: number
  /** 重连间隔上限（ms——默认 30000） */
  maxMs?: number
}

export interface WsOptions {
  /** WebSocket 构造器（注入——测试 mock——默认全局 WebSocket） */
  WebSocketCtor?: new (url: string) => WsLike
  /** 默认连接 URL（未传时 connect(url) 必需） */
  url?: string
  /** 断线自动重连（指数退避——默认关——显式开启不突改既有行为） */
  autoReconnect?: boolean | WsReconnectOptions
}

/** 最小 WS 形状（兼容浏览器 WebSocket 与测试 mock） */
export interface WsLike {
  send(data: string): void
  close(): void
  onmessage: ((e: { data: unknown }) => void) | null
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: ((e: unknown) => void) | null
}

export interface WsClient {
  /** 连接（切换 URL——旧连接关闭——未传用 opts.url） */
  connect(url?: string): void
  /** 连接状态（onopen 置 true——onclose 置 false） */
  isConnected: boolean
  /** 发送（JSON 序列化） */
  send(data: unknown): void
  /** 消息订阅（返回退订） */
  onMessage(cb: (data: unknown) => void): () => void
  /** 状态翻转订阅（订阅时回放当前态——onopen/onclose 触发——返回退订） */
  onStatusChange(cb: (connected: boolean) => void): () => void
  /** 关闭（主动——不触发自动重连） */
  close(): void
}

/** 创建 ws 客户端（每 serve 实例独立） */
export function ws(opts: WsOptions = {}): WsClient {
  const WsCtor = opts.WebSocketCtor ?? ((globalThis as { WebSocket?: new (u: string) => WsLike }).WebSocket)
  let sock: WsLike | null = null
  let manual = false
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const subs = new Set<(data: unknown) => void>()
  const statusSubs = new Set<(connected: boolean) => void>()

  const reconnectCfg = opts.autoReconnect
    ? (typeof opts.autoReconnect === 'object' ? opts.autoReconnect : {})
    : null

  const handleMessage = (e: { data: unknown }): void => {
    let data: unknown = e.data
    if (typeof e.data === 'string') {
      try { data = JSON.parse(e.data) } catch { /* 原样 */ }
    }
    for (const cb of [...subs]) cb(data)
  }

  const setConnected = (v: boolean): void => {
    if (connected.current === v) return
    connected.current = v
    for (const cb of [...statusSubs]) cb(v)
  }

  const connected = { current: false }

  const scheduleReconnect = (): void => {
    if (!reconnectCfg || manual || retryTimer) return
    const base = reconnectCfg.baseMs ?? 1000
    const max = reconnectCfg.maxMs ?? 30000
    const delay = Math.min(base * 2 ** retry, max)
    retry++
    retryTimer = setTimeout(() => {
      retryTimer = null
      open(lastUrl)
    }, delay)
  }

  let lastUrl = opts.url ?? ''
  const open = (url: string): void => {
    if (!WsCtor) return // 环境无 WS——静默（测试不连）
    lastUrl = url
    sock = new WsCtor(url)
    sock.onmessage = handleMessage
    sock.onopen = () => {
      retry = 0
      setConnected(true)
    }
    sock.onclose = () => {
      sock = null
      setConnected(false)
      scheduleReconnect()
    }
  }

  return {
    connect(url?: string): void {
      manual = false
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      retry = 0
      sock?.close()
      sock = null
      setConnected(false)
      open(url ?? opts.url ?? '')
    },
    get isConnected() {
      return connected.current
    },
    send(data: unknown): void {
      sock?.send(typeof data === 'string' ? data : JSON.stringify(data))
    },
    onMessage(cb: (data: unknown) => void): () => void {
      subs.add(cb)
      return () => { subs.delete(cb) }
    },
    onStatusChange(cb: (connected: boolean) => void): () => void {
      statusSubs.add(cb)
      cb(connected.current)
      return () => { statusSubs.delete(cb) }
    },
    close(): void {
      manual = true
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      sock?.close()
      sock = null
      setConnected(false)
    },
  }
}
