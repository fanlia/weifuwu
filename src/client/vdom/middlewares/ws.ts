import { Subject, BehaviorSubject, type Observable } from '../observable/index.ts'

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
 * - **心跳看门狗（2026-08——网络硬断静默挂起根因歼灭）**：浏览器对
 *   网络断（WiFi 闪断/离线仿真）**不触发 close/error**——socket 静默
 *   挂起——onclose 永不执行 → 重连调度永不启动——断线期间消息永远丢失
 *   （chat 断线补拉失效实证——CDP setOffline 场景）。修复：onopen 后
 *   周期发 ping，任何入站（pong/消息）刷新活性；超时未活性 → 强制
 *   close → onclose → setConnected(false) + 重连调度（应用层感知断线
 *   → 补拉）。此外 onerror 也走 close 路径（error→onclose 链）。
 */

export interface WsReconnectOptions {
  /** 重连基延迟（ms——指数退避起点——默认 1000） */
  baseMs?: number
  /** 重连间隔上限（ms——默认 30000） */
  maxMs?: number
}

export interface WsPingOptions {
  /** 心跳间隔（ms——默认 15000） */
  intervalMs?: number
  /** 活性超时（ms——超过无入站即判死——默认 35000） */
  timeoutMs?: number
  /** 心跳载荷（默认 { type: 'ping' }——标准 WS 协议） */
  payload?: () => unknown
}

export interface WsOptions {
  /** WebSocket 构造器（注入——测试 mock——默认全局 WebSocket） */
  WebSocketCtor?: new (url: string) => WsLike
  /** 默认连接 URL（未传时 connect(url) 必需） */
  url?: string
  /** 断线自动重连（指数退避——默认关——显式开启不突改既有行为） */
  autoReconnect?: boolean | WsReconnectOptions
  /** 心跳看门狗（网络硬断静默挂起检测——默认关） */
  ping?: WsPingOptions
}

/** 最小 WS 形状（兼容浏览器 WebSocket 与测试 mock） */
export interface WsLike {
  send(data: string): void
  close(): void
  /** 连接状态（浏览器 WebSocket 标准——CONNECTING=0 OPEN=1——Mock 需实现） */
  readyState: number
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
  /** **消息流视图（波次 7——onMessage 同源——可 pipe/takeUntil）** */
  messages$: Observable<unknown>
  /** **状态流视图（波次 7——BehaviorSubject 语义——订阅即回放当前态）** */
  status$: Observable<boolean>
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
  // **值源流视图（波次 7——onMessage/onStatusChange 同源——Subject 桥）**
  const messages = new Subject<unknown>()
  const statuses = new BehaviorSubject(false)

  const reconnectCfg = opts.autoReconnect
    ? (typeof opts.autoReconnect === 'object' ? opts.autoReconnect : {})
    : null

  const handleMessage = (e: { data: unknown }): void => {
    lastActivity = Date.now() // 心跳活性（任何入站——pong/消息——刷新）
    let data: unknown = e.data
    if (typeof e.data === 'string') {
      try { data = JSON.parse(e.data) } catch { /* 原样 */ }
    }
    for (const cb of [...subs]) cb(data)
    messages.next(data) // 同源流视图
  }

  const setConnected = (v: boolean): void => {
    if (connected.current === v) return
    connected.current = v
    for (const cb of [...statusSubs]) cb(v)
    statuses.next(v) // 同源流视图
  }

  const connected = { current: false }

  // ── 心跳看门狗（网络硬断静默挂起检测——浏览器不触发 close/error） ──
  const pingCfg = opts.ping
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let lastActivity = 0
  const stopPing = (): void => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  }
  const startPing = (): void => {
    if (!pingCfg || !sock) return
    stopPing()
    const interval = pingCfg.intervalMs ?? 15_000
    const timeout = pingCfg.timeoutMs ?? 35_000
    lastActivity = Date.now()
    pingTimer = setInterval(() => {
      if (!sock) { stopPing(); return }
      if (Date.now() - lastActivity > timeout) {
        // 静默挂起（无 close/error 事件——网络硬断）——强制 close 走 onclose
        // → setConnected(false)（应用层断线感知）+ scheduleReconnect（补拉链）
        try { sock.close() } catch { /* 已死 */ }
        return
      }
      if (sock.readyState !== 1) { try { sock.close() } catch { /* */ } return }
      try { sock.send(JSON.stringify(pingCfg.payload?.() ?? { type: 'ping' })) } catch { /* 半死 */ }
    }, interval)
  }

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
  /** CONNECTING 期间 send 队列（2026-08——连接建立前 send 抛
   *  InvalidStateError——订阅/指令在 connect 后立即发送的时序）——
   *  onopen flush（保序） */
  const pendingSend: string[] = []
  const open = (url: string): void => {
    if (!WsCtor) return // 环境无 WS——静默（测试不连）
    lastUrl = url
    sock = new WsCtor(url)
    sock.onmessage = handleMessage
    sock.onopen = () => {
      retry = 0
      setConnected(true)
      startPing()
      // CONNECTING 期间的 send 排队（保序推送——订阅在连接前发不丢）
      while (pendingSend.length > 0) sock?.send(pendingSend.shift()!)
    }
    sock.onerror = () => {
      // error → close 链（onclose 触发重连调度）——onerror 不处理后 socket 残留
      try { sock?.close() } catch { /* */ }
    }
    sock.onclose = () => {
      stopPing()
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
      stopPing()
      sock?.close()
      sock = null
      setConnected(false)
      open(url ?? opts.url ?? '')
    },
    get isConnected() {
      return connected.current
    },
    send(data: unknown): void {
      const payload = typeof data === 'string' ? data : JSON.stringify(data)
      if (sock?.readyState === 1) sock.send(payload) // OPEN
      else pendingSend.push(payload) // CONNECTING/CLOSED——排队或挂起（onopen flush）
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
    messages$: messages.asObservable(),
    status$: statuses.asObservable(),
    close(): void {
      manual = true
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      stopPing()
      sock?.close()
      sock = null
      setConnected(false)
    },
  }
}
