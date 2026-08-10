/**
 * weifuwu/client VNode — 兼容壳（类型与函数归 ui-dom——统一契约）
 *
 * 组件/渲染器/应用的 VNode 契约唯一来源：ui-dom/vnode.ts。
 */

export * from '../ui-dom/vnode.ts'
import type { VNode } from '../ui-dom/vnode.ts'
import { Fragment, Portal } from '../ui-dom/vnode.ts'
