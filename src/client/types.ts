/**
 * wefu 类型定义
 */

import type { Signal } from './signal.ts'
import type { Component } from './jsx-runtime.ts'

/**
 * wefu 上下文 — 组件通过第二个参数访问
 *
 * ```tsx
 * function MyPage(props, ctx: WfuiContext) {
 *   ctx.user              // 当前登录用户
 *   ctx.login(email, pw)  // 登录
 *   ctx.api.get('/users') // API 请求
 *   ctx.ws.send(data)     // WebSocket
 * }
 * ```
 */
export interface WfuiContext {
  route: {
    path: string
    params: Record<string, string>
    query: Record<string, string>
    hash: string
    component: Component | null
    title?: string
    auth?: boolean
    /** 路由 loader 返回的数据 */
    data: Record<string, unknown>
  }
  app: {
    navigate: (path: string) => void
  }

  // ── auth() 注入 ──
  user: { id: string; email: string; name: string; role: string; avatar?: string } | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  register: (input: { email: string; name: string; password: string }) => Promise<void>

  // ── api() 注入 ──
  api: {
    get<T>(path: string): Promise<T>
    post<T>(path: string, body?: unknown): Promise<T>
    put<T>(path: string, body?: unknown): Promise<T>
    patch<T>(path: string, body?: unknown): Promise<T>
    delete<T>(path: string): Promise<T>
  }

  // ── ws() 注入 ──
  ws: {
    send: (data: unknown) => void
    onMessage: (handler: (data: unknown) => void) => () => void
    join: (room: string) => void
    leave: (room: string) => void
    isConnected: Signal<boolean>
  }

  /** 跨组件共享数据 */
  provide: <T>(key: string, value: T) => void
  inject: <T>(key: string) => T | null

  /** 中间件注入扩展 */
  [key: string]: unknown
}

/** 中间件签名 */
export type AppMiddleware = (ctx: WfuiContext) => WfuiContext | Promise<WfuiContext>

/** 路由定义 */
export interface RouteDef {
  path: string
  component: Component
  auth?: boolean
  title?: string
  /** 页面加载器 — 切换路由时自动调用，结果注入 ctx.route.data */
  loader?: (ctx: WfuiContext) => Promise<Record<string, unknown>>
}
