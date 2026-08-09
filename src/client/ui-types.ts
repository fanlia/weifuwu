/**
 * weifuwu/client UI 类型 — UIRouter + VDOM 架构（平行新增，不动 createApp/router）
 *
 * 定稿架构（design/ui-architecture.md）：
 *   req = window.location，res = VNode，serveUI = VDOM（落地机制），params/query 在 ctx
 *   handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 *   middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode
 *
 * 与后端签名完全对齐：
 *   后端 Handler<T>   = (req: Request, ctx: T) => Response
 *   前端 UIHandler<C> = (location, ctx: WfuiContext & C) => VNode
 *   后端 Middleware   = (req, ctx, next) => Response
 *   前端 UIMiddleware = (location, ctx, children) => 内层 handler
 */

import type { WfuiContext } from './types.ts'
import type { VNode } from './vnode.ts'

/** UI 请求 = 浏览器位置（window.location，浏览器原生 Location，不包装） */
export type UIRequest = Location

/** UI 响应 = VNode（数据结构：type/props/key 组成的树）——serveUI（VDOM）负责落地到 DOM */
export type UIResponse = VNode | null

/**
 * UI 路由处理器 = 异步组件：async (location, ctx) => vnode
 *
 * - 首次调用 = mount（ctx.data.get 取数 + ctx.ui.$ 创建 + 初始化，只一次）
 * - $ 赋值 = render（ctx.data 缓存命中 + $ 路由实例复用 → 新 VNode → patch）
 * - 路由变化 = 新路由实例（新 mount，新 $）
 *
 * 对齐后端 handler(req, ctx) => Response。
 */
export type UIHandler<C extends object = {}> = (
  location: UIRequest,
  ctx: WfuiContext & C,
) => Promise<UIResponse> | UIResponse

/**
 * UI 中间件 = 两阶段 async（对齐组件模型外层 mount / 内层 render）：
 *
 *   - 外层 `async (location, ctx, children) => ...`：mount 一次——接收 children（下一层 handler）
 *   - 内层 `async (location, ctx) => vnode`：每次渲染——调 children(location, ctx) 得子 VNode 再包装
 *
 * layout 与 SSR 都是这种中间件（包装/落地 VNode）。
 */
export type UIMiddleware<I extends object = {}, O extends object = {}> = (
  location: UIRequest,
  ctx: WfuiContext & I,
  children: UIHandler<O>,
) => Promise<UIHandler<O>> | UIHandler<O>

/**
 * UI 路由定义（UIRouter.get 内部存储——path → handler）
 */
export interface UIRouteDef {
  /** 路由路径（支持 :param / * 通配） */
  path: string
  /** 路由处理器（异步组件） */
  handler: UIHandler<any>
  /** 页面标题（匹配时设置 document.title） */
  title?: string
}
