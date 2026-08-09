/**
 * weifuwu/ui-dom VNode 契约 — 与 client 共享（components 兼容）
 *
 * 复制算法，契约共享：VNode 形状/Fragment/Portal symbol 必须与 client 同一份
 * （components 用 client 的 h/createPortal 产 VNode，ui-dom 渲染器需识别同一 symbol）。
 * 渲染算法（render/diff）在 ui-dom 本地复制，registry 局部实例隔离。
 */

export * from '../client/vnode.ts'
export { Fragment, Portal, createPortal } from '../client/vnode.ts'
