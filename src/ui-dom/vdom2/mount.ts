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

import type { VNode, VNodeChild, CompVNode } from '../vnode.ts'
import { isComp } from '../vnode.ts'
import { createRegistry, type Registry } from './registry.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { patchValue, type PatchCtx } from './patch.ts'
import { auditEnabled, auditTree } from './audit.ts'
import { createClientBrowser } from '../browser.ts'
import { ctxVersion as getCtxVersion, type VdomCtx } from './ctx.ts'
import type { BrowserEnv } from '../types.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  /** 完整 ctx（ui-dom/context.ts createVdomContext 组装——ui 必填） */
  ctx: VdomCtx
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
          ctxVersion: getCtxVersion(ctx),
        }
        const node = patchValue(parent, comp._refNode ?? null, oldChild, newChild, patchCtx)
        comp._refNode = node
        // 阶段 C audit：__WF_VDOM_AUDIT 开启时 patch 后结构校验（错位即报错，不静默传播）
        if (auditEnabled()) {
          try {
            const msgs: string[] = []
            auditTree(parent, newChild, (msg) => msgs.push(msg))
            if (msgs.length) console.error('[vdom2/audit] ' + msgs.join(' | '))
          } catch (e) { console.error('[vdom2/audit] 校验异常:', e) }
        }
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[vdom2] render error:', (e as { stack?: string })?.stack ?? e)
    }
  }
  function render(ids?: string[]): Promise<void> {
    if (ids == null) return Promise.resolve()
    return Promise.all(ids.map((id) => renderOne(id))).then(() => {})
  }
  return { render }
}

/** 纯引擎挂载（接受已组装 ctx——ui-dom/context.ts 提供便捷入口） */
export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, browser } = opts
  const registry = opts.registry ?? createRegistry()
  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root, onError: opts.onError })
  const rootUi = ctx.ui
  let mounted: VNodeChild | null = null
  let prevChild: VNodeChild | null = null

  const handle: MountHandle = {
    ctx,
    registry,
    renderer,
    async mount(input) {
      mounted = input
      const built = await buildVNode(input, ctx, null, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, browser)
      if (node != null) opts.root.appendChild(node)
      prevChild = (built as VNode)?._child ?? built
      if (rootUi) rootUi._rootVNodeId = (built as VNode)?._id ?? null
      if (auditEnabled()) {
        try {
          const msgs: string[] = []
          auditTree(opts.root, built, (msg) => msgs.push(msg))
          if (msgs.length) console.error('[vdom2/audit] ' + msgs.join(' | '))
        } catch (e) { console.error('[vdom2/audit] 校验异常:', e) }
      }
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
        ctxVersion: getCtxVersion(ctx),
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
    // close 由上层按需提供（MountHandle.close? 可选）
  }
  handle.close = () => handle.unmount()
  return handle
}

// re-export（组装层/消费方需要）
import { callRefCleanupFor } from './registry.ts'
export { createRegistry }
export type { Registry }

/** vdom2 命令式挂载（toast/notification 等——buildVNode await 工厂 → renderValue → append） */
export function mountCommand(
  container: HTMLElement,
  vnode: VNode,
  ctx: VdomCtx | import('../types.ts').WfuiContext,
  opts?: { onMounted?: () => void },
): { id: string } {
  const vctx = ctx as VdomCtx
  const reg = vctx.__registry ?? createRegistry()
  const browser = vctx.browser ?? createClientBrowser()
  void Promise.resolve(buildVNode(vnode, vctx as VdomCtx, null, reg))
    .then(() => {
      const node = renderValue(vnode, vctx as VdomCtx, browser)
      if (node != null) container.appendChild(node)
      if (vnode._id && reg) {
        const v = reg.idRegistry.get(vnode._id)
        if (v) v._parentNode = container
      }
      opts?.onMounted?.()
    })
    .catch((e) => console.error('[vdom2] command mount error', e))
  return { id: vnode._id ?? '' }
}

/** vdom2 命令式卸载：ref 清理 + 卸载钩子 + 容器移除 */
export function unmountCommand(container: HTMLElement, vnode: VNode | null, ctx: VdomCtx | import('../types.ts').WfuiContext): void {
  const reg = (ctx as VdomCtx).__registry as Registry | undefined
  if (reg) {
    for (const [, v] of reg.idRegistry) {
      try { callRefCleanupFor(v, reg) } catch { /* noop */ }
    }
  }
  container.remove()
}

/** 命令式挂载容器（toast 等——body 下） */
export function createCommandContainer(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  const d = document.createElement('div')
  document.body.appendChild(d)
  return d
}
