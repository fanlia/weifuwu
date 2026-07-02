/**
 * vnode — Server-compatible lightweight node tree.
 *
 * h() creates a plain-object tree instead of real DOM elements.
 * Used by page() for SSR serialization.
 *
 * On the client, the real h() from h.ts creates actual DOM elements.
 */
import { Signal, Computed } from './signal.ts';
import type { ShowNode, EachNode } from './control-flow.ts';
export type VAttrValue = string | number | boolean | Signal | Computed | null | undefined;
export interface VAttrs {
    [key: string]: VAttrValue | ((...args: unknown[]) => unknown) | null | undefined;
}
export interface VNode {
    tag: string;
    attrs: VAttrs | null;
    children: VChild[];
}
export type VChild = VNode | string | number | boolean | null | undefined | Signal | Computed | ShowNode | EachNode | VChild[];
/**
 * Create a lightweight VNode tree.
 *
 * Signature matches the client-side h() for API compatibility.
 *
 * ```ts
 * h('div', { class: 'card' },
 *   h('span', null, count),       // count is a Signal
 *   h('button', { onclick: fn }, '+'),
 * )
 * ```
 */
export declare function h(tag: string, attrs: VAttrs | null, ...children: VChild[]): VNode;
/**
 * Serialize a VNode tree to an HTML string.
 * Used by page() during SSR.
 */
export declare function serialize(node: VNode): string;
