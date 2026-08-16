/**
 * vdom3 app — 应用注册表（多应用加载——app 节点消费）
 *
 * registerApp(appId, factory)：注册子应用（factory 返回子应用根 vnode——
 * 可 await 初始化——应用实例状态由工厂闭包持有——appId 复用不重跑）。
 * 渲染时（app 节点 build）：查注册表 → 工厂调用（首次/应用实例复用）→
 * 子应用根在父流构建——app:* 边界事件（mount/update/unmount/error——带 appId）。
 *
 * 不隔离设计（design/vdom3-app-node.md）：共享流/全局 id——天然归属唯一——
 * app 的价值 = 应用编排（注册表 + 生命周期 + 边界事件）。
 */

import type { VNode, V3Ctx } from './types.ts'

/** 子应用工厂：(props, ctx) => 子应用根 vnode（可 await——应用初始化） */
export type AppFactory = (props: Record<string, unknown>, ctx: V3Ctx) => Promise<VNode> | VNode

const appRegistry = new Map<string, AppFactory>()

/** 注册子应用（模块级——appId 全局唯一） */
export function registerApp(appId: string, factory: AppFactory): void {
  appRegistry.set(appId, factory)
}

/** 查询（app 节点 build 消费——未注册返回 null——app:error unknown-app） */
export function getAppFactory(appId: string): AppFactory | null {
  return appRegistry.get(appId) ?? null
}

/** 测试隔离 */
export function resetAppRegistry(): void {
  appRegistry.clear()
}
