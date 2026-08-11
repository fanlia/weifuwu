/**
 * vdom/scheduler — 渲染触发（无自动调度）
 *
 * **vdom 核心原则：只有用户显式操作才触发渲染**——
 *   - `$.xxx = val`（$ proxy set trap）
 *   - `ctx.ui.render(ids?)`
 *   - `ctx.ui.dirty(ids?)`
 * 除此之外**没有任何自动渲染**：无 flush 批处理、无微任务轮询、无 resolve 回调补渲染、
 * 无渲染循环。渲染是 fire-and-forget 的 async（buildVNode await 动态挂载组件）。
 *
 * 防重入：同一 id 同一时刻只跑一次渲染（渲染中再次触发 → 跳过——下次用户操作捕获）。
 */

import type { VNode } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import { buildVNode } from './build.ts'
import { patchValue, type PatchCtx } from './diff.ts'
import type { Registry } from './registry.ts'

export interface Scheduler {
  /** $ 赋值/手动请求渲染（fire-and-forget async） */
  dirty(ids?: string[]): void
  /** 立即渲染（与 dirty 等价——都直接触发，async 落地） */
  render(ids?: string[]): void
}

export interface SchedulerOptions {
  registry: Registry
  ctx: WfuiContext
  /** 根挂载容器（顶层组件无 _parentNode 时定位） */
  rootEl?: HTMLElement
  /** 当前渲染 ctx 版本（三态 skip） */
  getCtxVersion?: (id: string) => number
  onError?: (e: unknown) => void
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const renderingIds = new Set<string>()

  function isMounting(): boolean {
    return (opts.ctx.ui as any)?._mounting === true
  }

  async function renderByIds(id: string): Promise<void> {
    // 防重入：同一 id 同时只渲染一次（渲染中再次触发 → 跳过——非自动补渲染）
    if (renderingIds.has(id)) return
    const vnode = opts.registry.idRegistry.get(id)
    if (!vnode || typeof vnode._render !== 'function') return
    renderingIds.add(id)
    ;(opts.ctx.ui as any)._rendering = true
    try {
      const patchCtx: PatchCtx = {
        browser: opts.ctx.browser,
        registry: opts.registry,
        ctxVersion: opts.getCtxVersion?.(id) ?? 0,
        getCtxVersion: opts.getCtxVersion,
      }
      // async 预构建：await 动态挂载组件（首次出现）——完成后 diff 同步渲染
      const newChild = (await buildVNode(vnode._render!(vnode.props), opts.ctx, vnode._child, opts.registry, { force: true })) ?? null
      const oldChild = vnode._child as VNode | null
      vnode._child = newChild as VNode | VNode[] | null
      const parent = vnode._parentNode ?? opts.rootEl ?? null
      if (parent) {
        const node = patchValue(parent, vnode._refNode ?? null, oldChild, newChild, patchCtx)
        // 写回 _refNode（组件输出 null↔内容切换的定位锚点）
        if (node) vnode._refNode = node
        else vnode._refNode = null
      }
    } catch (e) {
      opts.onError?.(e)
    } finally {
      renderingIds.delete(id)
      ;(opts.ctx.ui as any)._rendering = false
    }
  }

  function dirty(ids?: string[]): void {
    if (isMounting()) return
    if (ids == null) {
      const selfId = (opts.ctx.ui as any)?._selfId
      if (selfId) void renderByIds(selfId)
      return
    }
    for (const id of ids) void renderByIds(id)
  }

  function render(ids?: string[]): void {
    if (isMounting()) return
    if (ids == null) {
      const selfId = (opts.ctx.ui as any)?._selfId
      if (selfId) void renderByIds(selfId)
      return
    }
    for (const id of ids) void renderByIds(id)
  }

  return { dirty, render }
}
