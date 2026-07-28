/**
 * weifuwu/client 类型定义
 */

/** 应用上下文 */
export interface WfuiContext {
  [key: string]: unknown

  /** UI 框架能力（由 createApp.mount 注入） */
  ui: {
    /** 触发组件重渲染 */
    render: () => void
    /** 标记脏状态，下个微任务批量渲染（嵌套突变后用） */
    dirty: () => void
    /** 当前组件持久化状态（Proxy 自动 dirty：$.x = val 自动触发渲染） */
    $: Record<string, any>
    /** 首次执行标记 */
    ready: boolean
    /** 组件首次渲染后触发（DOM 未创建） */
    onmount: (fn: () => void) => void
    /** 组件 DOM 创建后触发，接收根元素，返回值作为 cleanup */
    onmounted: (fn: (el: Element) => (() => void) | void) => void
    /** 组件移除前清理 */
    onunmount: (fn: () => void) => void
    /** props 变化时触发，接收旧 props */
    onupdate: (fn: (prevProps: any) => void) => void
  }

  /** 路由（由 router 中间件注入） */
  route?: {
    path: string
    params: Record<string, string>
    query: Record<string, string>
    [key: string]: any
  }

  /** 应用方法 */
  app?: {
    navigate: (path: string) => void
    [key: string]: any
  }

  /** WebSocket 客户端（由 ws 中间件注入） */
  ws?: {
    send: (msg: any) => void
    onMessage: (fn: (msg: any) => void) => () => void
    isConnected: boolean
    [key: string]: any
  }

  /** API 客户端（由 api 中间件注入） */
  api?: {
    get: <T = any>(url: string, opts?: any) => Promise<T>
    post: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    put: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    patch: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    delete: <T = any>(url: string, opts?: any) => Promise<T>
    [key: string]: any
  }

  /** 认证状态 */
  auth?: {
    token: string | null
    user: any
    isLoggedIn: boolean
    login: (token: string, user: any, refreshToken?: string) => void
    logout: () => void
    [key: string]: any
  }
}

/** 中间件签名 */
export type AppMiddleware = (ctx: WfuiContext) => WfuiContext

/** 路由定义 */
export interface RouteDef {
  path: string
  component?: (props: any, ctx: WfuiContext) => any
  layout?: (props: any, ctx: WfuiContext) => any
  children?: RouteDef[]
  auth?: boolean
  title?: string
  [key: string]: any
}

/** 扩展 ctx — 创建新对象，原 ctx 的 getter 通过原型链继承 */
export function extendCtx<T extends Record<string, unknown>>(
  ctx: WfuiContext,
  fields: T,
): WfuiContext & T {
  return Object.assign(Object.create(ctx), fields) as WfuiContext & T
}
