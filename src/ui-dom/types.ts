/**
 * weifuwu/ui-dom 类型 — 与 client 契约共享（components 兼容）
 *
 * ctx = WfuiContext（client 定义：ui 19 原语/browser/params/query/data）。
 * 路由形态类型（UIHandler/UIMiddleware/UIRouteDef）在此定义。
 */

export * from '../client/types.ts'
export * from '../client/vnode.ts'

import type { WfuiContext } from '../client/types.ts'
import type { VNode } from '../client/vnode.ts'
export type { WfuiContext } from '../client/types.ts'
export type { VNode } from '../client/vnode.ts'

/** req = window.location（浏览器原生 Location，不包装） */
export type UIRequest = Location

/** res = VNode（数据结构）；serveUI = VDOM（落地） */
export type UIResponse = VNode | null

/** handler = 异步组件：async (location, ctx) => vnode（$ 有效） */
export type UIHandler<C extends object = {}> = (
  location: Location,
  ctx: WfuiContext & C,
) => Promise<UIResponse> | UIResponse

/** middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode */
export type UIMiddleware<I extends object = {}, O extends object = {}> = (
  location: Location,
  ctx: WfuiContext & I,
  children: UIHandler<any>,
) => Promise<UIHandler<O>> | UIHandler<O>

/** 路由定义（UIRouter.get 内部存储） */
export interface UIRouteDef {
  path: string
  handler: UIHandler
  title?: string
}
