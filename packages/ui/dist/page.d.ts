/**
 * page() — Create a SSR-handler from a VNode factory.
 *
 * Returns a standard Handler compatible with Router.get().
 *
 * ```ts
 * import { page, h, ref } from '@weifuwu/ui'
 *
 * router.get('/', page((ctx) => {
 *   const count = ref(0)
 *   return h('button', { onclick: () => count.value++ }, count)
 * }))
 * ```
 */
import type { Handler } from '@weifuwujs/core';
import { type VNode } from './vnode.ts';
export interface PageContext {
    [key: string]: unknown;
    head?: Record<string, string>;
}
export declare function page(factory: (ctx: PageContext) => VNode): Handler;
