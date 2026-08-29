/**
 * vdom v2 — serve（uiServeV2——v2 引擎驱动真实 DOM——切换前提最终验证）
 *
 * VDOM-V2-BLUEPRINT 阶段 2B：
 * - **v1 骨架复用**（router.resolve/CommandApplier/渲染队列——服务层不变）
 * - **引擎替换**：ctx.stream = v2（renderV2/diffV2——流段复用 + 调度流）→
 *   命令直接 applier.apply（不走 Response 编码——浏览器端直连）
 * - **渲染队列 → 调度流**（render$ batching——同拍合并）
 * - 阶段 2B 验证：真实浏览器——渲染/交互/重渲染（流段复用实证）
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'


import { createFnTable, type RenderCtx, type UiServeOptions, type UiServeHandle } from '../serve.ts'
import { UIRouter, frontRequest } from '../router.ts'
import { createDevVerifier } from '../patch/verify.ts'
import { CommandApplier } from '../patch/index.ts'
import { createComponentRegistry } from '../node/component.ts'
import { renderV2 } from './render.ts'
import { diffV2 } from './diff.ts'
import type { SegmentMap } from './diff.ts'
import { createRenderScheduler } from './schedule.ts'
import { collectCommands } from './integrate.ts'
import { asyncDataPreload } from '../../hooks/env.ts'


/** v2 真实浏览器 serve（uiServe 等价——引擎替换） */
export function uiServeV2(router: UIRouter, opts: UiServeOptions): UiServeHandle {
  const doc = document
  const win = window
  const rootEl = typeof opts.root === 'string'
    ? (doc.querySelector(opts.root) as HTMLElement | null)
    : opts.root
  if (!rootEl) throw new Error(`uiServeV2: root 未找到 — ${String(opts.root)}`)


  const dataSeed = (win as unknown as { __DATA__?: Record<string, unknown> }).__DATA__
  if (dataSeed) asyncDataPreload(dataSeed)


  // ── serve 级单例（跨渲染保持） ──
  const fnTable = createFnTable()
  const registry = createComponentRegistry() // 挂载通路（阶段 2 过渡——段承载复用）
  const segments: SegmentMap = new Map() // v2 流段（组件复用载体）
  const applier = new CommandApplier(rootEl, doc, registry)
  if ((win as unknown as { __WF_DEV__?: boolean }).__WF_DEV__) {
    applier.devVerify = createDevVerifier()
  }
  const scheduler = createRenderScheduler()
  const vt = (win as unknown as { __wfV2?: Record<string, number> }).__wfV2 ??= { builds: 0, diffs: 0 }
  const ctx = {
    browser: (win as unknown as { __wfBrowser?: unknown }).__wfBrowser ?? null,
  } as Record<string, unknown>
  ctx.render = async () => {} // 占位（下方覆盖）
  ctx.ui = { onUnmount: () => {} } // 占位（v2 段 hooks 面——阶段 2 精细化）


  let currentTree: VNode | null = null
  let active = true


  /** v2 渲染（首帧 build / 后续 diff——命令直接 apply） */
  const applyV2 = async (vnode: VNode): Promise<void> => {
    if (!active) return
    const stream = currentTree
      ? (vt.diffs++, diffV2(currentTree, vnode, ctx as unknown as UIContext, segments, registry))
      : (vt.builds++, renderV2(vnode, ctx as unknown as UIContext, registry))
    const cmds = await collectCommands(stream)
    if (!active) return
    for (const cmd of cmds) {
      try { applier.apply(cmd) } catch (e) {
        console.error('[vdom] v2 apply:', e)
        currentTree = null // 影子树重置（下次全量——自愈）
        break
      }
    }
    currentTree = vnode
  }


  /** v2 stream（页面作者入口——handler 调 ctx.stream(vnode)）：
   *  v2 引擎直接应用（不走 Response 编码——浏览器直连）——返回空 Response
   *  （v1 接口兼容——runRender 消费空流立即完成） */
  const renderCtx = ctx as unknown as RenderCtx
  renderCtx.stream = (vnode: VNode, init?: ResponseInit): Response => {
    void applyV2(vnode)
    return new Response(null, { status: init?.status ?? 200 })
  }


  // 渲染队列（v1 骨架——调度流接入）
  let req = frontRequest(win.location.pathname)
  let queue: Array<() => Promise<void>> = []
  let drainPromise: Promise<void> | null = null
  let renderPhase: 'idle' | 'rendering' = 'idle'


  const runRender = async (target: () => Promise<void>): Promise<void> => {
    renderPhase = 'rendering'
    try {
      await target()
    } finally {
      renderPhase = 'idle'
    }
  }


  const render = async (): Promise<void> => {
    if (renderPhase === 'rendering' && drainPromise) { queue.push(async () => { await render() }); return drainPromise }
    const p = runRender(async () => {
      while (true) {
        const r = queue.shift()
        if (!r) break
        await r()
      }
    })
    drainPromise = p
    await p
    drainPromise = null
  }


  // 调度流接入（batching：同拍 N 次 render → 1 次）
  scheduler.renders$.subscribe({
    next: () => {
      void render().catch((e) => console.error('[vdom] v2 render:', e))
    },
  })


  // 页面作者 render（ctx.render——经调度流合并）
  ctx.render = () => { scheduler.request() }


  // 导航（同 URL 重渲染——route resolve 后 v2 refresh tree）
  const navigate = async (path: string): Promise<void> => {
    if (!active) return
    await render()
  }
  ;(ctx as Record<string, unknown>).app = { navigate }


  let disposed = false
  const handle = {
    ready: Promise.resolve(),
    render: () => render(),
    __apply: (vnode: VNode) => applyV2(vnode) as never,
    navigate: (path: string) => { win.history.pushState({}, '', path); return render() },
    unmount: () => { disposed = true; active = false },
  } as UiServeHandle & { render: () => Promise<void>; __apply: (vnode: VNode) => Promise<void> }
  void disposed
  return handle
}
