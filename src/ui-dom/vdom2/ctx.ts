/**
 * vdom2 ctx — 类型化渲染上下文（强类型——替代散落的 `ctx as any`/WfuiContext 宽松类型）
 *
 * ctx 是开放扩展（中间件/组件注入任意字段如 data/route）——本接口定义 vdom 引擎
 * 依赖的已知字段；扩展字段由注入方 cast 到具体接口。
 */

import type { BrowserEnv } from '../types.ts'
import type { Registry } from './registry.ts'

/** ctx.ui（组装层 ui-dom/context.ts 提供完整能力——引擎只依赖以下字段） */
export interface VdomUi {
  _ctxVersion?: number
  _mounting?: boolean
  _rootVNodeId: string | null
  setMounting?(v: boolean): void
  endMounting?(): void
  render(ids?: string[]): Promise<void>
}

/** vdom2 渲染上下文（build/render/patch/mount 依赖的已知字段）——ui 必填（由组装层 ui-dom/context.ts 创建） */
export interface VdomCtx {
  browser: BrowserEnv
  __registry: Registry
  ui: VdomUi
  [key: string]: unknown
}

/** 组件名提取（强类型——替代 `(type as any).name`） */
export function componentName(type: unknown): string {
  return typeof type === 'function' ? ((type as { name?: string }).name || 'anonymous') : 'anonymous'
}

/** ctx.ui 版本号（三态 skip 基准） */
export function ctxVersion(ctx: VdomCtx): number {
  return ctx.ui?._ctxVersion ?? 0
}

/** ctx.ui.render（组件内部 render 转发——闭包绑定 id 由组装层 childCtx 处理） */
export function ctxRender(ctx: VdomCtx, ids?: string[]): Promise<void> {
  return ctx.ui.render(ids)
}

/** 挂载保护期开关（工厂执行期间跳过渲染请求） */
export function setMounting(ctx: VdomCtx, v: boolean): void {
  ctx.ui?.setMounting?.(v)
}
