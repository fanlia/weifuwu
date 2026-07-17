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
    /** 路由 loader 是否正在加载 */
    loading: boolean
    /** 页面切换过渡动画名 */
    transition?: string
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

/**
 * 类型安全的上下文工厂 — 创建 provide/inject 对。
 *
 * 相比 ctx.provide('key', value) / ctx.inject('key') 的字符串 key 方式，
 * createContext 返回类型化的 provide/inject 函数，拼写错误在编译时即被捕获。
 *
 * ```tsx
 * // 创建
 * const ThemeCtx = createContext<string>('theme')
 *
 * // 在根组件注入
 * ThemeCtx.provide(ctx, 'dark')
 *
 * // 在子组件读取（类型安全，返回 string | null）
 * const theme = ThemeCtx.inject(ctx)  // 'dark' | null
 * ```
 */
export function createContext<T>(key: string): {
  provide: (ctx: WfuiContext, value: T) => void
  inject: (ctx: WfuiContext) => T | null
} {
  return {
    provide: (ctx: WfuiContext, value: T) => ctx.provide(key, value),
    inject: (ctx: WfuiContext): T | null => ctx.inject(key) as T | null,
  }
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
  /** 页面切换过渡动画名，对应 CSS class 前缀 */
  transition?: string
}
