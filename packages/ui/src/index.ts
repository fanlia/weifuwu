/**
 * @weifuwujs/ui — Page layer for full-stack development.
 *
 * Usage:
 *   import { serve, Router } from '@weifuwujs/core'
 *   import { page, h, ref } from '@weifuwujs/ui'
 */

export { h, serialize } from './vnode.ts'

export { when, each } from './control-flow.ts'
export type { VNode, VChild, VAttrs } from './vnode.ts'

export { page } from './page.ts'
export type { PageContext } from './page.ts'

export { ref, computed, effect, batch, Signal, Computed } from './signal.ts'

export { weifuwuiAssets } from './assets.ts'
