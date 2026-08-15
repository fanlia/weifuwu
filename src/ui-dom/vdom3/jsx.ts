/**
 * vdom3 JSX 辅助——声明式视图（无整树 diff：文本/属性绑定 + Show/For 结构指令）
 */

import type { V3Node, ElementNode, StructNode, TextBind } from './types.ts'

/** 元素：props 中的函数值 = 动态绑定（属性/文本/事件） */
export function h(tag: string, props?: Record<string, unknown>, ...children: V3Node[]): ElementNode {
  return { kind: 'element', tag, props, children }
}

/** 文本绑定点：`() => count()`——signal 变化只更新此文本 */
export function bind(fn: () => unknown): TextBind {
  return { kind: 'text-bind', fn }
}

/** 条件结构：when 为 true 渲染内容，否则移除 */
export function Show(opts: { when: () => unknown; render: () => V3Node }): StructNode {
  return { kind: 'struct', type: 'show', when: opts.when, render: opts.render }
}

/** 列表结构：keyed 局部 diff（只 diff 列表项） */
export function For<T>(opts: { each: () => T[]; key?: (item: T) => string; render: (item: T, index: number) => V3Node }): StructNode {
  return { kind: 'struct', type: 'for', each: opts.each as () => unknown[], key: opts.key as (item: unknown) => string, render: opts.render as (item: unknown, index?: number) => V3Node }
}
