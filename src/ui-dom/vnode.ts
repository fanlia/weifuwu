/**
 * vnode — VNode 工厂/类型统一入口（vdom3 转发层——vdom2 实现已删除）
 *
 * vdom2 时代本文件是独立 VNode 判别联合（NativeVNode/FragVNode/CompVNode/
 * PortalVNode + createVNode + isFrag/isComp 守卫）。全面 vdom3 后：
 * 工厂（h/jsx/jsxs/jsxDEV/createPortal）与类型（VNode/VNodeChild/Component）
 * 统一收敛到 vdom3——本文件作为转发层保留路径（组件库 249 处 import 零改动）。
 *
 * Fragment/Portal 符号统一为 vdom3 的（'v3-fragment'/'v3-portal'）——
 * 引擎 classifyKind 按 type 类型 + portalKey 分类（不依赖具体 symbol 值）。
 */

export { h, jsx, jsxs, jsxDEV, createPortal, Fragment, Portal } from './vdom3/jsx.ts'
export type { VNode, VNodeChild, Component } from './vdom3/types.ts'
