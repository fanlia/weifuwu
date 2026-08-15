/**
 * vdom3 compat — vdom2 ↔ vdom3 组件兼容层（类型安全边界）
 *
 * vdom2 两阶段组件（ctx: WfuiContext——ctx.ui.render）与 vdom3（ctx: V3Ctx——
 * ctx.render）同模型——唯一差异是 ctx 接口。compat() 是**类型安全适配器**：
 * 公开签名无 any（V2Comp → Component——类型化转换）——内部断言一次（适配器边界）。
 *
 * 迁移：vdom2 组件 `h(compat(V2Comp), props)` 即可在 vdom3 树运行（零改动组件代码）。
 * 注意：compat 结果必须模块级稳定引用（renderFn 内调用 → type 引用变化 → 组件无法复用）。
 */

import type { Component as V2Comp } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import type { Component, V3Ctx, VNode } from './types.ts'

/** vdom2 组件 → vdom3 组件（ctx.ui.render → v3 ctx.render 适配） */
export function compat<P extends Record<string, unknown>>(comp: V2Comp<P>): Component<P> {
  return async (initProps: P, ctx: V3Ctx) => {
    // 适配器边界（一次断言）：v3 ctx → v2 ctx
    // ui 直接复用 V3Ui（hooks shim——完整转发——组件库零改动运行）
    const v2ctx = Object.assign(Object.create(ctx), {
      ui: ctx.ui,
    }) as unknown as WfuiContext
    const renderFn = await comp(initProps, v2ctx)
    return renderFn as (props: P) => Promise<VNode | null>
  }
}

/** vdom3 组件 → vdom2 组件（反向互操作——ctx.render 从 ui.render 取） */
export function toV2<P extends Record<string, unknown>>(comp: Component<P>): V2Comp<P> {
  const adapted = async (initProps: P, ctx: WfuiContext) => {
    const v3ctx = Object.assign(Object.create(ctx), {
      render: () => { ctx.ui?.render?.() },
    }) as unknown as V3Ctx
    return comp(initProps, v3ctx)
  }
  // 适配器边界（v2/v3 VNode 名义类型差异——结构兼容）
  return adapted as unknown as V2Comp<P>
}
