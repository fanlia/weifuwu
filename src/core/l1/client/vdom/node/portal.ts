/**
 * vdom core — 浮层容器 id（命令式弹窗内核（openPopup）使用）
 *
 * 2027-03：Portal vnode 机制已删除（弹窗命令式改造——唯一形态 ctx.ui.openPopup
 * ——内容直接 renderToStream 到独立 applier——主树零 Portal vnode）。
 * 本文件仅保留容器 id 工具（openPopup 挂载到 #__wf_portal 下 per-key 子容器）。
 */

/** 统一浮层容器 id（body 下——z-index/Escape/夹紧统一管理） */
export const PORTAL_CONTAINER_ID = '__wf_portal'

/** portal 容器 id（按 key——语义化——组件名） */
export function portalContainerId(portalKey: string): string {
  return `${PORTAL_CONTAINER_ID}-${portalKey}`
}
