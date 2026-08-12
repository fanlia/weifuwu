/**
 * vdom2 mount — 挂载入口 + 渲染执行器（最小核心版——矩阵测试需要；hooks/popup/serve 后续补全）
 *
 * 渲染管线：buildVNode（async 预构建——await 全部工厂）→ renderValue（同步落地）
 * ctx.ui.render：render-only（design/render-only-plan.md）——唯一渲染触发，
 * fire-and-forget async（await 可精确等待）。
 */

import type { VNode, VNodeChild, CompVNode } from './vnode.ts'
import { isComp } from './vnode.ts'
import { createRegistry, type Registry } from './registry.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue, type PatchCtx } from './patch.ts'
import { createClientBrowser } from '../browser.ts'
import type { BrowserEnv } from '../types.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
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

/** 组装 vdom 渲染上下文（ctx/registry/renderer/rootUi——最小核心：render/selfId） */
export function createVdomContext(opts: MountOptions): VdomContext {
  const registry = opts.registry ?? createRegistry()
  const rootUi: any = {
    _selfId: '_wf_root',
    _mounting: false,
    _ctxVersion: 0,
    _rootVNodeId: undefined as string | undefined,
  }
  const ctx: any = {
    browser: opts.browser,
    __registry: registry,
  }
  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root })

  let warnedNoTarget = false
  rootUi.render = function (this: any, ids?: string[]): Promise<void> {
    // this = 调用者的 childCtx.ui（组件 ctx.ui.render() → this._selfId = 组件 id）
    if (ids == null) {
      const self = this._selfId !== '_wf_root' && this._selfId ? this._selfId : rootUi._rootVNodeId
      if (!self) {
        if (!warnedNoTarget) {
          warnedNoTarget = true
          console.warn('[vdom2] render() 无参但无渲染目标：页面根是 native vnode（UIHandler 直接返回 vnode 的页面形态）。改用 async 组件形态或 createStore + useExternal。')
        }
        return Promise.resolve()
      }
      return renderer.render([self])
    }
    return renderer.render(ids)
  }
  rootUi.setMounting = (v: boolean) => { rootUi._mounting = v }
  rootUi.endMounting = () => { rootUi._mounting = false }
  rootUi.bumpCtxVersion = () => { rootUi._ctxVersion = (rootUi._ctxVersion ?? 0) + 1 }
  rootUi.selfId = function (this: any, name: string) {
    if (registry.idRegistry.has(name)) {
      throw new Error(`[vdom2] Duplicate component ID: "${name}"`)
    }
    const vnode = this._selfVNode
    if (!vnode) return
    vnode._customId = name
    registry.idRegistry.set(name, vnode)
  }
  ;(ctx as any).ui = rootUi
  return { ctx, registry, renderer, rootUi }
}

export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, registry, renderer, rootUi } = createVdomContext(opts)
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
      const node = renderValue(built, ctx, opts.browser)
      if (node != null) opts.root.appendChild(node)
      prevChild = (built as VNode)?._child ?? built
      rootUi._rootVNodeId = (built as VNode)?._id
    },
    async rerender() {
      if (mounted == null) return
      const built = await buildVNode(mounted, ctx, mounted as VNode, registry, { force: true })
      const rootV = mounted as VNode
      const oldChild = prevChild
      const newChild = rootV._child
      const prevNode = opts.root.firstChild
      patchValue(opts.root, prevNode, oldChild, newChild, {
        browser: opts.browser, registry,
        ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0,
        force: true,
      })
      prevChild = newChild
    },
    unmount() {
      for (const [, vnode] of registry.idRegistry) {
        try {
          import('./registry.ts').then(({ callRefCleanupFor }) => callRefCleanupFor(vnode, registry))
        } catch { /* noop */ }
      }
      opts.root.innerHTML = ''
    },
    close: undefined,
  }
  ;(handle as any).close = () => handle.unmount()
  return handle
}
