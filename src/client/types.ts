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
 *   ctx.app.navigate('/chat')
 *   ctx.provide('key', value)
 *   const val = ctx.inject('key')
 * }
 * ```
 */
export interface WfuiContext {
  route: {
    path: string
    params: Record<string, string>
    query: Record<string, string>
    hash: string
    /** 当前匹配的路由组件（由 router 中间件注入） */
    component: Component | null
    /** 当前匹配的路由配置 */
    title?: string
    auth?: boolean
  }
  app: {
    navigate: (path: string) => void
  }
  /** 跨组件共享数据（类似 React Context / Vue provide/inject） */
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
}
