/**
 * vdom3 compat — vdom2 ↔ vdom3 组件兼容层（迁移路径）
 *
 * vdom2 两阶段组件 `(initProps, ctx) => async (props) => VNode` 与 vdom3 同模型——
 * 唯一差异是 ctx 接口：vdom2 用 `ctx.ui.render()`（vdom2 的 ui 上下文）。
 *
 * compat()：包一层——ctx.ui.render → v3 ctx.render（调度自身重渲染——同 tick 合并）。
 * 迁移：vdom2 组件 `h(compat(V2Comp), props)` 即可在 vdom3 树运行（无需改组件代码）。
 *
 * 裁剪（诚实）：只适配 render/onUnmount/基础 ctx——vdom2 的 hooks
 * （useExternal/useMedia/usePopup 等 ctx.ui.* 依赖）不在兼容范围
 * （迁移时由调用方注入或重构）。
 */

import type { Component } from './types.ts'

type V2Component = (initProps: any, ctx: any) => Promise<(props: any) => Promise<any>>

/** vdom2 组件 → vdom3 组件（ctx.ui.render 适配） */
export function compat(comp: V2Component): Component {
  return async (initProps, ctx: any) => {
    const v2ctx = {
      ...ctx,
      ui: {
        render: () => ctx.render?.(),
      },
    }
    return comp(initProps, v2ctx)
  }
}

/** vdom3 组件 → vdom2 组件（反向互操作——ctx.render 从 ui.render 取） */
export function toV2(comp: Component): V2Component {
  return async (initProps, ctx: any) => {
    const v3ctx = {
      ...ctx,
      render: () => ctx.ui?.render?.(),
    }
    return (comp as Component)(initProps, v3ctx)
  }
}
