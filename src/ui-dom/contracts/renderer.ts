/**
 * contracts/renderer — 渲染服务契约（引擎抽象——ui-dom 与引擎的唯一接触面）
 *
 * vdom4 端口化 UI-2：引擎（engines/）实现 RendererService；ui-dom 的服务层
 * （services/）与命令式中间件（confirm/toast/notification）只消费本接口——
 * v5 换引擎 = 新增 engines/vdom5/ 实现 + index.ts 一行注册——其余零改动。
 *
 * 引擎内部的一切（影子状态/diff/命令/事件代理/调度）不进契约。
 */

import type { VNode } from './vnode.ts'
import type { V3Ctx } from './ctx.ts'

/** 应用根句柄（createRoot 返回值——组件获得 ctx.render 调度能力） */
export interface RootHandle {
  ctx: V3Ctx
  /** 组件重渲染（ctx.render 内部路径——同 tick 合并） */
  rerender(): void
  /** 立即刷新（测试） */
  flush(): void
  unmount(): void
  /** 首帧完成 Promise（初始挂载——工厂 await + 渲染落地） */
  ready: Promise<void>
}

/** 路由句柄（createRouter 返回值） */
export interface RouterHandle {
  navigate(path: string): void
  /** 当前路径 */
  path(): string
  /** 立即处理当前 URL（测试/恢复） */
  refresh(): void
  close(): void
}

/** 路由定义（RouteDef[] 声明式——SSR/SPA 同源） */
export interface RouteDef {
  path: string
  /** 页面渲染（params 注入——:id 等） */
  render: (params: Record<string, string>) => VNode
  /** 布局包裹（可选——页面在布局插槽内——函数引用稳定 → 跨路由复用） */
  layout?: (page: VNode) => VNode
}

/** 渲染服务（引擎抽象——唯一耦合点——原子能力最小面） */
export interface RendererService {
  /** 创建应用根（挂载组件树——组件获得 ctx.render 调度） */
  createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): RootHandle
  /** 创建路由应用（popstate 导航；options.history === false 隔离模式） */
  createRouter(routes: RouteDef[], root: HTMLElement, options?: { initialPath?: string; ctx?: Record<string, unknown>; history?: boolean }): RouterHandle
  /** 命令式挂载（confirm/toast/notification——临时容器——resolve/自动消失时 unmount） */
  mountCommand(vnode: VNode, container: HTMLElement, options?: { ctx?: Record<string, unknown> }): { unmount(): void; rerender(): void }
  /** SSR：组件树 → HTML（SEO/首帧——客户端 hydrate 吸收） */
  renderToString(vnode: VNode, options?: { ctx?: Record<string, unknown> }): string | Promise<string>
}
