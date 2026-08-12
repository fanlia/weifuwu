/**
 * vdom2 mount — 纯引擎挂载核心（无 ctx 组装、无 hooks——那些在 ui-dom/context.ts 组装层）
 *
 * 分层（vdom2 方案）：
 * - vdom2/ = 纯渲染引擎（vnode/kind/render/patch/build/mount 核心——改 vdom 不影响其他）
 * - ui-dom/context.ts = 组装层（createVdomContext：ctx.ui 完整能力 + hooks 转发 + popup tracker）
 * - ui-dom/middleware/ = 中间件（uiServe 等——后续迁移）
 *
 * 渲染管线：buildVNode（async 预构建——await 全部工厂）→ renderValue（同步落地）
 * ctx.ui.render：render-only（design/render-only-plan.md）——唯一渲染触发。
 */

import type { VNode, VNodeChild, CompVNode } from '../vnode2.ts'
import { isComp } from '../vnode2.ts'
import { createRegistry, type Registry } from './registry.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue, type PatchCtx } from './patch.ts'
import { createClientBrowser } from '../browser.ts'
import type { BrowserEnv } from '../types.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  /** 完整 ctx（ui-dom/context.ts createVdomContext 组装——含 ctx.ui.render 等） */
  ctx: any
  registry?: Registry
  renderer?: Renderer
  onError?: (e: unknown) => void
}

export interface MountHandle {
  ctx: any
  registry: Registry
  renderer: Renderer
  mount(comp: VNodeChild): Promise<void>
  rerender(): Promise<void>
  unmount(): void
  close?(): void
}

export interface Renderer {
  render(ids?: string[]): Promise<void>
}

export interface VdomContext {
  ctx: any
  registry: Registry
  renderer: Renderer
  rootUi: any
}

/** 渲染执行器（render-only 唯一渲染入口——无调度队列，直接执行） */
export function createRenderer(opts: {
  registry: Registry
  ctx: any
  rootEl?: HTMLElement | null
  onError?: (e: unknown) => void
}): Renderer {
  const { registry, ctx } = opts
  async function renderOne(id: string): Promise<void> {
    const vnode = registry.idRegistry.get(id)
    if (!vnode || !isComp(vnode) || typeof vnode._render !== 'function') return
    const comp = vnode as CompVNode
    try {
      // renderFn 强制异步：await 数据 → 输出 vnode 树
      const output = await comp._render!(comp.props)
      const newChild = (await buildVNode(output, ctx, comp._child, registry)) ?? null
      const oldChild = comp._child
      comp._child = newChild as VNode | VNode[] | null
      // 定位渲染容器：_parentNode 优先；_refNode.parentNode fallback
      const parent = comp._parentNode ?? comp._refNode?.parentNode ?? opts.rootEl ?? null
      if (parent) {
        const patchCtx: PatchCtx = {
          browser: ctx.browser ?? createClientBrowser(),
          registry,
          ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0,
        }
        const node = patchValue(parent, comp._refNode ?? null, oldChild, newChild, patchCtx)
        comp._refNode = node
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[vdom2] render error:', (e as any)?.stack ?? e)
    }
  }
  function render(ids?: string[]): Promise<void> {
    if (ids == null) return Promise.resolve()
    return Promise.all(ids.map((id) => renderOne(id))).then(() => undefined)
  }
  return { render }
}

/** 纯引擎挂载（接受已组装 ctx——ui-dom/context.ts 提供便捷入口） */
export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, browser } = opts
  const registry = opts.registry ?? createRegistry()
  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root, onError: opts.onError })
  const rootUi = (ctx as any).ui
  let mounted: VNodeChild | null = null
  let prevChild: VNodeChild | null = null

  const handle: MountHandle = {
    ctx,
    registry,
    renderer,
    async mount(input) {
      mounted = input
      const built = await buildVNode(input, ctx, undefined, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, browser)
      if (node != null) opts.root.appendChild(node)
      prevChild = (built as VNode)?._child ?? built
      if (rootUi) rootUi._rootVNodeId = (built as VNode)?._id
    },
    async rerender() {
      if (mounted == null) return
      const built = await buildVNode(mounted, ctx, mounted as VNode, registry, { force: true })
      const rootV = mounted as VNode
      const oldChild = prevChild
      const newChild = rootV._child
      const prevNode = opts.root.firstChild
      patchValue(opts.root, prevNode, oldChild, newChild, {
        browser, registry,
        ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0,
        force: true,
      })
      prevChild = newChild
    },
    unmount() {
      for (const [, vnode] of registry.idRegistry) {
        try {
          callRefCleanupFor(vnode, registry)
        } catch { /* noop */ }
      }
      opts.root.innerHTML = ''
    },
    close: undefined,
  }
  ;(handle as any).close = () => handle.unmount()
  return handle
}

// re-export（组装层/消费方需要）
import { callRefCleanupFor } from './registry.ts'
export { createRegistry }
export type { Registry }
