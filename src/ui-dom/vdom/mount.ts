/**
 * vdom/mount — 挂载入口（首帧 + ctx/ui 组装）
 *
 * 渲染管线：buildVNode（async 预构建）→ renderValue（同步落地）。
 * ctx.ui：render/dirty/$/setMounting/endMounting——$ 绑定创建时的组件 id。
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import type { BrowserEnv } from '../types.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { createScheduler, type Scheduler } from './scheduler.ts'
import { createRegistry, type Registry } from './registry.ts'
import { createReactiveState } from './state.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  registry?: Registry
  scheduler?: Scheduler
  onError?: (e: unknown) => void
}

export interface MountHandle {
  ctx: WfuiContext
  registry: Registry
  scheduler: Scheduler
  /** 挂载根组件 */
  mount(comp: Component | VNodeChild): Promise<void>
  /** 卸载（清理 DOM） */
  unmount(): void
}

export function mountRoot(opts: MountOptions): MountHandle {
  const registry = opts.registry ?? createRegistry()
  const rootUi: any = {
    _selfId: '_wf_root',
    _mounting: false,
    _rendering: false,
  }
  const ctx: WfuiContext = {
    browser: opts.browser,
    __registry: registry,
  } as any

  const scheduler = opts.scheduler ?? createScheduler({ registry, ctx, rootEl: opts.root })

  rootUi.render = function (this: any, ids?: string[]) {
    // this = 调用者的 childCtx.ui（组件 ctx.ui.render() → this._selfId = 组件 id）
    if (ids == null) { const self = this._selfId ?? '_wf_root'; if (self) scheduler.render([self]) }
    else scheduler.render(ids)
  }
  rootUi.dirty = function (this: any, ids?: string[]) {
    if (ids == null) { const self = this._selfId ?? '_wf_root'; if (self) scheduler.dirty([self]) }
    else scheduler.dirty(ids)
  }
  rootUi.$ = function (this: any) {
    const selfId = this._selfId ?? '_wf_root'
    return createReactiveState(() => scheduler.dirty([selfId]), {
      isMounting: () => rootUi._mounting === true,
    })
  }
  rootUi.setMounting = (v: boolean) => { rootUi._mounting = v }
  rootUi.endMounting = () => { rootUi._mounting = false }

  ;(ctx as any).ui = rootUi

  const handle: MountHandle = {
    ctx,
    registry,
    scheduler,
    async mount(input) {
      // 首帧：buildVNode（await 全部工厂）→ renderValue（同步落地）
      const built = await buildVNode(input as VNodeChild, ctx, undefined, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, opts.browser)
      if (node != null) opts.root.appendChild(node)
    },
    unmount() {
      opts.root.innerHTML = ''
      registry.idRegistry.clear()
    },
  }
  return handle
}
