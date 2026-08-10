/**
 * weifuwu/client VNode — 兼容壳（类型与函数归 ui-dom——统一契约）
 *
 * 组件/渲染器/应用的 VNode 契约唯一来源：ui-dom/vnode.ts。
 */

export * from '../ui-dom/vnode.ts'
import type { VNode } from '../ui-dom/vnode.ts'
import { Fragment, Portal } from '../ui-dom/vnode.ts'
declare global {
  namespace JSX {
    type Element = import('../ui-dom/vnode.ts').VNode | null
    // 宽松结构类型：兼容 client 与 ui-dom 的 Component（两阶段组件形状）
    type ElementType =
      | string
      | ((props: any, ctx: any) => any)
      | typeof Fragment
      | typeof Portal
    interface IntrinsicElements {
      [tag: string]: any
    }
    interface IntrinsicAttributes {
      key?: string | number
    }
  }
}
