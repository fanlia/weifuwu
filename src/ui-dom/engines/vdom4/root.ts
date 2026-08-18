/**
 * vdom4 root — createRoot（会话 Engine——统一渲染原语 + 串行调度 + epoch）
 *
 * 消除 vdom3 的挂起超时 hack 与 busy/dirty/updatingComps 双轨：
 *  - renderFn 同步（类型强制）——无 await 竞速——挂起不可能
 *  - 统一调度队列（root + comp 同一队列——串行——epoch 世代——渲染中触发 → 合并）
 *  - 组件级更新 = 同一原语的 target=comp（无独立机制）
 */

import type { VNode, Ctx, DataPipe, Command } from './types.ts'
import { childrenOf } from './types.ts'
import { ShadowState } from './shadow.ts'
import { buildVNode } from './build.ts'
import { diffTree } from './diff.ts'
import { diffComponent } from './diff.ts'
import { applyCommands, type ApplyEnv } from './apply.ts'

/** 组件 ctx 组装（vdom4 面——**每组件实例一份**——render 闭包绑定 compId：
 *  ctx.render() 无参 = 本组件级更新（事件回调里调用——非 build 上下文——必须闭包绑定） */
function makeCompCtx(
  engine: Engine,
  data: DataPipe,
  inject: Record<string, unknown> | undefined,
  compId: string,
): Ctx {
  return Object.assign(Object.create(inject ?? {}), {
    render: (ids?: string[]) => {
      if (ids && ids.length > 0) engine.render(ids)
      else engine.renderComp(compId) // 无参 = 本组件（统一原语的 comp target）
    },
    data,
    // onUnmount 绑定本组件（工厂期注册——卸载时执行）
    onUnmount: (fn: () => void) => { engine.unmountHooksFor(compId).push(fn) },
    browser: (inject as { browser?: unknown })?.browser ?? (typeof document !== 'undefined' ? {} : null),
    ui: {},
    __compId: compId,
  }) as Ctx
}

/** 数据管道（缓存/并发合并——错误/超时由 fetcher 或调用方管理——不挂起管线） */
export function createDataPipe(): DataPipe {
  const cache = new Map<string, Promise<unknown>>()
  return {
    get: <T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T> => {
      let p = cache.get(key)
      if (!p) {
        p = fetcher ? Promise.resolve(fetcher()) : (fetch(key).then((r) => r.json()) as Promise<T>)
        cache.set(key, p)
      }
      return p as Promise<T>
    },
    set: (key, value) => { cache.set(key, Promise.resolve(value)) },
    has: (key) => cache.has(key),
  }
}

/** 渲染目标（统一原语） */
type Target = { kind: 'root' } | { kind: 'comp'; id: string }

/** 引擎会话（每 root 一个——P4 会话实例化） */
export class Engine {
  shadow: ShadowState = new ShadowState()
  registry = new Map<string, Node>()
  unmountHooks = new Map<string, Array<() => void>>()
  currentCompId: string | null = null

  private current: VNode | null = null
  private root: HTMLElement
  ctx: Ctx
  private data: DataPipe
  private pending: Array<() => void> = []
  private running = false
  private iterations = 0
  private readonly MAX_ITERATIONS = 10

  private inject: Record<string, unknown> | undefined

  constructor(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }) {
    this.root = root
    this.data = createDataPipe()
    this.inject = options?.ctx
    this.ctx = makeCompCtx(this, this.data, options?.ctx, 'root')
    void vnode
  }

  /** 组件 ctx 工厂（build 调用——per-component 绑定） */
  createCompCtx(compId: string): Ctx {
    return makeCompCtx(this, this.data, this.inject, compId)
  }

  /** 组件级渲染（统一原语 comp target） */
  renderComp(compId: string): void {
    this.schedule({ kind: 'comp', id: compId })
  }

  unmountHooksFor(compId: string): Array<() => void> {
    let arr = this.unmountHooks.get(compId)
    if (!arr) { arr = []; this.unmountHooks.set(compId, arr) }
    return arr
  }

  /** 统一渲染原语（root/comp/语义 id——同一入口） */
  render(ids?: string[]): void {
    if (ids && ids.length > 0) {
      // 语义 id → comp（服务层映射——最小闭环：id 即 compId）
      for (const id of ids) this.schedule({ kind: 'comp', id })
    } else {
      this.schedule({ kind: 'root' })
    }
  }

  private schedule(target: Target): void {
    // 同目标合并（同 tick 多次 render —— 只执行最后一次）
    if (this.pending.some((p) => (p as { t?: string }).t === target.kind + ':' + (target.kind === 'comp' ? target.id : ''))) {
      // 已有同目标排队——替换为最新（合并）
      const idx = this.pending.findIndex((p) => (p as { t?: string }).t === target.kind + ':' + (target.kind === 'comp' ? target.id : ''))
      this.pending[idx] = Object.assign(() => void this.run(target), { t: target.kind + ':' + (target.kind === 'comp' ? target.id : '') })
      return
    }
    this.pending.push(Object.assign(() => void this.run(target), { t: target.kind + ':' + (target.kind === 'comp' ? target.id : '') }))
    if (!this.running) {
      this.running = true
      this.iterations = 0
      queueMicrotask(() => { this.drain(); this.running = false })
    }
  }

  private drain(): void {
    // 串行队列——渲染中触发 → 排队下一轮（合并）——循环上限防死循环
    if (++this.iterations > this.MAX_ITERATIONS) {
      console.error('[vdom4] 渲染循环超限（疑似死循环）——中止本轮')
      this.pending = []
      return
    }
    const batch = this.pending
    this.pending = []
    for (const fn of batch) { try { fn() } catch (e) { console.error('[vdom4] render error:', e) } }
    if (this.pending.length > 0) queueMicrotask(() => this.drain())
  }

  private async run(target: Target): Promise<void> {
    if (target.kind === 'comp') await this.updateComponent(target.id)
    else await this.updateRoot()
  }

  /** 根更新（整树——build + diff + apply） */
  private async updateRoot(): Promise<void> {
    if (!this.rootVNode) return
    const built = await buildVNode(this.rootVNode, this.ctx, this.shadow, this.current, 'root', this.createCompCtx.bind(this))
    const cmds = diffTree(built, this.shadow)
    this.apply(cmds)
    this.current = built
  }

  /** 组件级更新（统一原语——同一 diff/apply 管线——只动该组件子树） */
  private async updateComponent(compId: string): Promise<void> {
    const inst = this.shadow.getInstance(compId)
    if (!inst) return
    this.currentCompId = compId
    try {
      const output = inst.renderFn(inst.lastProps)
      const oldOut = inst.lastOutput
      if (output) {
        const built = await buildVNode(output, this.ctx, this.shadow, oldOut, `${compId}.c`, this.createCompCtx.bind(this))
        inst.nextOutput = built
      } else {
        inst.nextOutput = null
      }
      const cmds = diffComponent(compId, this.shadow)
      this.apply(cmds)
    } finally {
      this.currentCompId = null
    }
  }

  private apply(cmds: Command[]): void {
    const env: ApplyEnv = { registry: this.registry, shadow: this.shadow, unmountHooks: this.unmountHooks }
    // 首帧：检测 SSR 内容（吸收）
    if (this.current == null && !this.absorbed) {
      const ssrOld = [...this.root.childNodes]
      const hasSsr = ssrOld.some((n) =>
        (n.nodeType === 1 && (n as Element).hasAttribute('data-v4-id'))
        || (n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor')))
      if (hasSsr) { this.shadow.beginAbsorb(this.root); this.absorbed = true }
    }
    applyCommands(cmds, env, this.root)
    if (this.absorbed) {
      for (const n of [...this.root.childNodes]) {
        if (!this.shadow.absorbedNodes.has(n)) this.root.removeChild(n)
      }
      this.shadow.endAbsorb()
      this.absorbed = false
    }
  }

  private absorbed = false
  private rootVNode: VNode | null = null

  /** 挂载（首帧） */
  async mount(vnode: VNode): Promise<void> {
    this.rootVNode = vnode
    const built = await buildVNode(vnode, this.ctx, this.shadow, null, 'root', this.createCompCtx.bind(this))
    const cmds = diffTree(built, this.shadow)
    this.apply(cmds)
    this.current = built
  }

  unmount(): void {
    // dispose 协议（最小闭环：组件钩子 + 容器清空——完整 dispose 后续）
    for (const hooks of this.unmountHooks.values()) {
      for (const h of hooks) { try { h() } catch { /* 隔离 */ } }
    }
    this.unmountHooks.clear()
    this.shadow.instances.clear()
    this.root.innerHTML = ''
    this.current = null
  }
}

/** 创建应用根（vdom4 入口） */
export function createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): { ready: Promise<void>; unmount(): void; engine: Engine } {
  const engine = new Engine(vnode, root, options)
  const ready = engine.mount(vnode)
  return {
    ready,
    unmount: () => engine.unmount(),
    engine,
  }
}

export { childrenOf }
