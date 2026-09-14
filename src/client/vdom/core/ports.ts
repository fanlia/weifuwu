/**
 * vdom core — 客户端端口类型（L1 协议面——中间件只留实现）
 *
 * W2 分层：core（protocol/context）声明这里需要的**端口类型**；
 * 实现（middlewares/api.ts · auth-i18n.ts · ws.ts）导入并重出——
 * core 零中间件依赖（依赖方向：装备 → core）。
 *
 * 纪律：接口单源在此；中间件不得私藏同名接口。
 */
import type { Observable } from '../observable/index.ts'

// ── auth 端口 ─────────────────────────────────────────────

export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface AuthClient {
  getToken(): string | null
  setToken(token: string | null): void
  /** 请求头注入（Authorization: Bearer） */
  headers(): Record<string, string>
  logout(): void
  /** 当前用户（userKey 持久化——login/setUser 写——未登录 null） */
  user: unknown
  /** 是否已登录（token 存在） */
  isLoggedIn: boolean
  /** **token 值流（波次 7——login/setToken/logout 触发——BehaviorSubject
   *  语义——订阅即收当前 token——应用层监听登录态变化）** */
  token$: Observable<string | null>
  /** 登录（token/user/refreshToken 持久化——onAuth 钩子接线） */
  login(token: string, user: unknown, refreshToken?: string | null): void
  /** 更新用户信息（原地写——userKey 持久化） */
  setUser(user: unknown): void
  /** 刷新 token（onRefresh 钩子——成功重写 token 返回 true） */
  refresh(): Promise<boolean>
}

// ── i18n 端口 ─────────────────────────────────────────────

export interface I18nState {
  locale: string
  setLocale(locale: string): void
  /** **locale 值流（波次 7——setLocale 事件源——Subject 语义——无自动
   *  渲染纪律保持：订阅方自行决定渲染时机）** */
  locale$: Observable<string>
  /** 取文本（{name} 插值——缺失 key 返回 key 本身——不静默） */
  t(key: string, params?: Record<string, unknown>): string
  /** 组件文案面（ui-dom 兼容——SheetGrid/SlideCanvas 读组件级文案——
   *  可选——无注入时 undefined） */
  components?: Record<string, Record<string, string>>
}

// ── api 端口 ──────────────────────────────────────────────

export interface ApiRequestOptions {
  headers?: Record<string, string>
}

export interface ApiClient {
  get<T>(url: string, opts?: ApiRequestOptions): Promise<T>
  post<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  put<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  delete<T>(url: string, opts?: ApiRequestOptions): Promise<T>
  patch<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  request<T>(method: string, url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
}

// ── ws 端口 ───────────────────────────────────────────────

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
