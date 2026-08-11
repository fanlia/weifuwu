/**
 * vdom/scheduler — 渲染触发（render-only，design/render-only-plan.md）
 *
 * **vdom 核心原则：只有 ctx.ui.render() 显式触发渲染**——
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
  /**
   * 渲染（render-only 唯一触发）。
   * 语义：同步调用、异步落地——DOM 更新在 buildVNode（async 预构建）完成后，
   * 即当前同步代码之后（≥1 微任务 tick；动态挂载组件更久）。
   * fire-and-forget（调用方 void 掉即可）；需要精确等待渲染完成时 `await render()`。
   */
  render(ids?: string[]): Promise<void>
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
  const pending = new Set<string>()
  // 渲染中触发 → 注册等待者：await render() 等到【本次 + 连锁补跑全部完成】后的最终 DOM
  const waiters = new Map<string, Array<() => void>>()
  // 全局渲染互斥锁：async buildVNode（await 动态挂载/数组 Promise.all）会在渲染中 yield——
  // 若此时另一 id 的 renderByIds 启动，会读到「新 vnode 已注册但 _child 未设」的中间态
  // （mountAsyncComponent 先 reg.set 后 build 子树）→ oldChild undefined → patchValue 走
  // insertBefore 新增分支 → 同一组件 DOM 被复制（DatePicker 选中日期后多渲染一个的真实根因）。
  // v1 render 同步执行（renderByIds 同步 diff 不 yield）天然串行；v2 async 渲染必须显式互斥
  // 恢复 v1 串行语义——渲染中触发的 render 排队，当前渲染完成（含补跑链）后逐个执行。
  let globalRendering = false
  const globalQueue: Array<() => void> = []

  function notifyWaiters(id: string): void {
    const arr = waiters.get(id)
    if (arr) {
      waiters.delete(id)
      for (const r of arr) r()
    }
  }

  async function renderByIdsCore(id: string): Promise<void> {
    // 防重入：渲染中再次触发 → 排队补跑（不丢请求——流式 token 渲染中到达必须最终落地）。
    // 渲染中多次触发合并为一次补跑（读最新状态——非批处理风暴）。
    // 本次 promise 等【补跑完成】——await render() 保证 DOM 是最终状态（非提前 resolve）
    if (renderingIds.has(id)) {
      pending.add(id)
      return new Promise<void>((resolve) => {
        const arr = waiters.get(id) ?? []
        arr.push(resolve)
        waiters.set(id, arr)
      })
    }
    const vnode = opts.registry.idRegistry.get(id)
    if (!vnode || typeof vnode._render !== 'function') {
      notifyWaiters(id)
      return
    }
    renderingIds.add(id)
    ;(opts.ctx.ui as any)._rendering = true
    try {
      const patchCtx: PatchCtx = {
        browser: opts.ctx.browser,
        registry: opts.registry,
        ctxVersion: opts.getCtxVersion?.(id) ?? 0,
        getCtxVersion: opts.getCtxVersion,
      }
      // render-only 精确重渲染（设计：render 不再需要 mount 阶段的重活）：
      // 1. 目标组件 renderFn 是【同步】的（内层返回 vnode）——显式重跑读最新闭包状态（force 语义）
      // 2. buildVNode 不传 force → 子组件走剪枝：props 同 → 复用旧 _child（renderFn 不重跑，
      //    父 render 不扰动子组件内部状态）；props 变 → 重跑；新出现组件 → await 工厂（唯一异步点）
      const output = vnode._render!(vnode.props)
      const newChild = (await buildVNode(output, opts.ctx, vnode._child, opts.registry)) ?? null
      const oldChild = vnode._child as VNode | null
      vnode._child = newChild as VNode | VNode[] | null
      // 定位渲染容器：_parentNode 优先；_refNode.parentNode fallback（
      // _refNode 是组件输出的真实 DOM 锚点——挂载后未经历 diff 的组件 _parentNode 可能缺失，
      // 直接 fallback rootEl 会把整树当 diff 基准 → 整树被组件输出覆盖 → 重挂 → 动画重启 → 渲染风暴）
      const parent = (vnode as any)._parentNode ?? (vnode as any)._refNode?.parentNode ?? opts.rootEl ?? null
      if (parent) {
        const node = patchValue(parent, (vnode as any)._refNode ?? null, oldChild, newChild, patchCtx)
        // 写回 _refNode（组件输出 null↔内容切换的定位锚点）
        if (node) (vnode as any)._refNode = node
        else (vnode as any)._refNode = null
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[weifuwu] render error:', (e as any)?.stack ?? e)
    } finally {
      renderingIds.delete(id)
      ;(opts.ctx.ui as any)._rendering = false
    }
    // 补跑链：渲染完成后处理排队触发——链式 await 直到 pending 空（渲染中多次触发合并为一次）
    while (pending.delete(id)) {
      await renderByIds(id)
    }
    // 所有连锁补跑完成 → 通知等待者（await render() 拿到最终 DOM）
    notifyWaiters(id)
  }

  async function renderByIds(id: string): Promise<void> {
    if (globalRendering) {
      // 渲染中：排队等当前渲染完成（全局串行——v1 同步渲染语义）
      return new Promise<void>((resolve, reject) => {
        globalQueue.push(() => {
          renderByIds(id).then(resolve, reject)
        })
      })
    }
    globalRendering = true
    try {
      await renderByIdsCore(id)
    } finally {
      globalRendering = false
      const next = globalQueue.shift()
      if (next) next()
    }
  }

  function render(ids?: string[]): Promise<void> {
    // 挂载期不丢弃：renderByIds 的 `_render` 检查天然跳过未挂载组件（工厂执行中）。
    // 已挂载组件（如页面 async 组件加载期间被用户点击）的 render 必须执行——
    // 全局 _mounting 丢弃曾导致「挂载期交互静默失效」（open=true 但弹窗不打开）。
    if (ids == null) {
      const selfId = (opts.ctx.ui as any)?._selfId
      if (selfId) return renderByIds(selfId)
      return Promise.resolve()
    }
    return Promise.all(ids.map((id) => renderByIds(id))).then(() => undefined)
  }

  return { render }
}
