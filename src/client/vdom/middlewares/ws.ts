/**
 * vdom middlewares — ws（WebSocket 客户端——ctx.ws 注入面）
 *
 * 设计：WebSocket 构造经 opts 注入（jsdom 无 WS——测试 mock——
 * 零全局直接访问）；onMessage 订阅（返回退订）；unmount 关闭。
 */

export interface WsOptions {
  /** WebSocket 构造器（注入——测试 mock——默认全局 WebSocket） */
  WebSocketCtor?: new (url: string) => WsLike
  /** 默认连接 URL（未传时 connect(url) 必需） */
  url?: string
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
  /** 关闭 */
  close(): void
}

/** 创建 ws 客户端（每 serve 实例独立） */
export function ws(opts: WsOptions = {}): WsClient {
  const WsCtor = opts.WebSocketCtor ?? ((globalThis as { WebSocket?: new (u: string) => WsLike }).WebSocket)
  let sock: WsLike | null = null
  const subs = new Set<(data: unknown) => void>()

  const handleMessage = (e: { data: unknown }): void => {
    let data: unknown = e.data
    if (typeof e.data === 'string') {
      try { data = JSON.parse(e.data) } catch { /* 原样 */ }
    }
    for (const cb of [...subs]) cb(data)
  }

  const connected = { current: false }
  return {
    connect(url?: string): void {
      sock?.close()
      if (!WsCtor) return // 环境无 WS——静默（测试不连）
      sock = new WsCtor(url ?? opts.url ?? '')
      sock.onmessage = handleMessage
      sock.onopen = () => { connected.current = true }
      sock.onclose = () => { connected.current = false; sock = null }
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
    close(): void {
      sock?.close()
      sock = null
    },
  }
}
