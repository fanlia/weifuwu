/**
 * vdom/scheduler — 渲染触发（render-only）
 *
 * 顺序执行模型：render 调用按序排队（promise 链），前一个渲染完成后再执行
 * 下一个——JS 事件循环天然串行，用户操作触发的 render 本来就该顺序落地。
 * 无互斥锁/无 waiters/无补跑链：每次 render 都完整执行 buildVNode + patchValue。
 *
 * 关键：enqueue 时【同步】检查 _render（未挂载/挂载中组件跳过）——不能推迟到
 * 链内检查：mountCommand 挂载期 add()→render() 时 _render 未设（跳过），若推迟
 * 到微任务执行，_render 已设但 _parentNode 未设 → patch 错位到 rootEl（toast 空壳）。
 */
import type { VNode } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import { buildVNode } from './build.ts'
import { patchValue, type PatchCtx } from './diff.ts'
import type { Registry } from './registry.ts'

export interface Scheduler {
  render(ids?: string[]): Promise<void>
}
export interface SchedulerOptions {
  registry: Registry
  ctx: WfuiContext
  rootEl?: HTMLElement
  onError?: (e: unknown) => void
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  // 顺序队列：所有 render 排队执行（后触发等前一个完成）——恢复「用户操作顺序落地」
  let chain: Promise<void> = Promise.resolve()

  async function renderByIds(id: string): Promise<void> {
    const vnode = opts.registry.idRegistry.get(id)
    if (!vnode || typeof vnode._render !== 'function') return
    try {
      const patchCtx: PatchCtx = {
        browser: opts.ctx.browser,
        registry: opts.registry,
        // 当前 ctx 版本（rootUi._ctxVersion——bumpCtxVersion 递增；三态 skip 版本比较基准）
        ctxVersion: (opts.ctx as any)?.ui?._ctxVersion ?? 0,
      }
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
        if (node) (vnode as any)._refNode = node
        else (vnode as any)._refNode = null
      }
    } catch (e) {
      if (opts.onError) opts.onError(e)
      else console.error('[weifuwu] render error:', (e as any)?.stack ?? e)
    }
  }

  function enqueue(id: string): Promise<void> {
    // 同步检查：未挂载/挂载中组件跳过（_render 未设）——不等链内异步检查
    const vnode = opts.registry.idRegistry.get(id)
    if (!vnode || typeof vnode._render !== 'function') return Promise.resolve()
    const p = chain.then(() => renderByIds(id))
    chain = p.catch(() => {}) // 错误不中断队列
    return p
  }

  function render(ids?: string[]): Promise<void> {
    if (ids == null) {
      const selfId = (opts.ctx.ui as any)?._selfId
      if (selfId) return enqueue(selfId)
      return Promise.resolve()
    }
    return Promise.all(ids.map((id) => enqueue(id))).then(() => undefined)
  }
  return { render }
}
