/**
 * control-flow — when() and each() for responsive conditional/list rendering.
 *
 * These create special VNode markers that are interpreted by:
 * - Server (vnode.ts serialize): reads signal.peek(), renders correct branch
 * - Client (h.ts reactiveRender): subscribes to signal, inserts/removes DOM
 *
 * Usage:
 * ```ts
 * const show = ref(false)
 * const items = ref([1, 2, 3])
 *
 * h('div', null,
 *   when(show, () => h('p', null, 'shown when truthy')),
 *   each(items, (item, i) => h('li', null, item)),
 * )
 * ```
 */

import { Signal, Computed } from './signal.ts'
import { type VNode } from './vnode.ts'
import { type HChild } from './h.ts'

// ── Type markers ──

export interface ShowNode {
  _type: 'show'
  signal: Signal<unknown> | Computed<unknown>
  factory: () => VNode | null | undefined
}

export interface EachNode {
  _type: 'each'
  signal: Signal<unknown[]> | Computed<unknown[]>
  factory: (item: unknown, index: number) => VNode
}

// ── Server / shared API ──

/**
 * Conditionally render a VNode based on a signal.
 *
 * Server: reads signal.peek(), renders factory() if truthy
 * Client: subscribes to signal, calls factory() on changes
 *
 * ```ts
 * const show = ref(false)
 * when(show, () => h('p', null, 'detail'))
 * ```
 */
export function when(
  signal: Signal<unknown> | Computed<unknown>,
  factory: () => VNode | null | undefined,
): ShowNode {
  return { _type: 'show', signal, factory }
}

/**
 * Render a list of VNodes from an array signal.
 *
 * Server: reads signal.peek(), maps through factory
 * Client: subscribes to signal, re-maps on changes
 *
 * ```ts
 * const items = ref(['a', 'b', 'c'])
 * each(items, (item, i) => h('li', null, `${i}: ${item}`))
 * ```
 */
export function each(
  signal: Signal<unknown[]> | Computed<unknown[]>,
  factory: (item: unknown, index: number) => VNode,
): EachNode {
  return { _type: 'each', signal, factory }
}
