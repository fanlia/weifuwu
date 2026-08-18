/**
 * vdom core — Portal（浮层渲染到远程容器——独立文件）
 *
 * 设计（AGENTS §5.4 弹窗纪律 + §4.0 结构符号内化）：
 * - Portal 为内部符号——公共面不导出——createPortal 是 usePopup 内部
 *   机制（组件库 28 浮层组件 0 直接使用——一律 usePopup）
 * - 渲染目标：#__wf_portal（body 下统一浮层容器）——portalKey 语义化
 *   （组件名——同组件多个弹层区分）——容器 id = `${PORTAL_CONTAINER_ID}-${key}`
 * - 命令流：主树插槽 = createAnchor（占位——同构）；portal 内容
 *   create/insert 到 portal 容器（id 前缀 'portal:'——命名空间隔离——
 *   与主树 id 永不冲突）
 * - SSR：portal 内容服务端照常序列化（HTML 尾部 #__wf_portal 容器内——
 *   hydration 收养）
 */

import type { VNode, VNodeChild } from './vnode.ts'

/** Portal 内部符号（usePopup 内部机制——浮层渲染到 #__wf_portal） */
export const Portal: unique symbol = Symbol('vdom-portal')

/** 统一浮层容器 id（body 下——z-index/Escape/夹紧统一管理） */
export const PORTAL_CONTAINER_ID = '__wf_portal'

/** portal 内容 id 前缀（命名空间隔离——与主树 id 永不冲突） */
export const PORTAL_ID_PREFIX = 'portal:'

/** Portal vnode 判定 */
export function isPortal(v: VNode): boolean {
  return v.type === Portal
}

/** portal 容器 id（按 key——语义化——组件名） */
export function portalContainerId(portalKey: string): string {
  return `${PORTAL_CONTAINER_ID}-${portalKey}`
}

/** 创建 Portal vnode（usePopup 内部调用——纯数据） */
export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  return {
    type: Portal,
    props: { children: Array.isArray(children) ? children : [children] },
    key: (portalKey as string | null) ?? null,
  }
}
