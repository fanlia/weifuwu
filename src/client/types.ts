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
 *   ctx.route.path        // 当前路由路径
 *   ctx.route.params      // 路由参数
 *   ctx.app.navigate('/') // 页面导航
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

  // ── ws() 注入 ──
  ws: {
    send: (data: unknown) => void
    onMessage: (handler: (data: unknown) => void) => () => void
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

/**
 * 中间件签名 — 返回新的或扩展后的 ctx。
 *
 * 中间件返回 ctx 有两种模式：
 *
 * 1. **新增字段**：用 `extendCtx(ctx, { field: value })`，保留原 ctx 的 getter。
 *
 * 2. **覆盖字段**：用 `{ ...ctx, get field() { ... }, ... }`，用 getter 覆盖原字段。
 *    适用于需要用信号 getter 替换静态 null 值的场景。
 *
 * 注意：不要用 `Object.assign(ctx, { field })`，它会把 getter 求值为快照值。
 */
export type AppMiddleware = (ctx: WfuiContext) => WfuiContext | Promise<WfuiContext>

/**
 * 扩展 ctx — 创建新对象，原 ctx 的 getter 通过原型链继承。
 *
 * 用于中间件向 ctx 添加新字段，而不破坏已有字段的响应式 getter。
 *
 * ```ts
 * function myMiddleware(): AppMiddleware {
 *   return (ctx) => extendCtx(ctx, {
 *     myField: { hello: 'world' },
 *   })
 * }
 * ```
 */
export function extendCtx<T extends Record<string, unknown>>(
  ctx: WfuiContext,
  fields: T,
): WfuiContext & T {
  return Object.assign(Object.create(ctx), fields) as WfuiContext & T
}

/** 路由定义 */
export interface RouteDef {
  path: string
  /** 路由组件（叶子节点） */
  component?: Component
  /** 布局组件（非叶子节点，渲染 <Outlet/> 显示子路由） */
  layout?: Component
  /** 子路由（嵌套路由 / 布局路由） */
  children?: RouteDef[]
  auth?: boolean
  title?: string
  /** 页面加载器 — 切换路由时自动调用，结果注入 ctx.route.data */
  loader?: (ctx: WfuiContext) => Promise<Record<string, unknown>>
  /** 页面切换过渡动画名，对应 CSS class 前缀 */
  transition?: string
}
