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
import { createV4Ui } from './ui.ts'
import { createClientBrowser } from '../../browser.ts'

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
    browser: (inject as { browser?: unknown })?.browser ?? createClientBrowser(),
    ui: createV4Ui(compId, () => engine.renderComp(compId), (fn) => engine.unmountHooksFor(compId).push(fn)),
    __compId: compId,
  }) as Ctx
}

/** 数据管道（缓存/并发合并 + **三场景**：SSR 种子收集 / hydration preload 预热 /
 *  SPA fetch——错误/超时由 fetcher 或调用方管理——不挂起管线） */
export function createDataPipe(): DataPipe {
  const cache = new Map<string, Promise<unknown>>()
  const resolved = new Map<string, unknown>() // 已解析值（SSR 种子收集）
  return {
    get: <T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T> => {
      let p = cache.get(key)
      if (!p) {
        p = fetcher ? Promise.resolve(fetcher()) : (fetch(key).then((r) => r.json()) as Promise<T>)
        cache.set(key, p)
        // 种子收集（SSR——渲染后 seed() 取——resolve 后记录）
        p.then((v) => resolved.set(key, v)).catch(() => {})
      }
      return p as Promise<T>
    },
    /** 失败重试（fetch 失败/业务错误——缓存中 reject 的 promise 可清除重取——
     *  默认失败缓存永不 resolve（组件挂起态）——显式重试入口） */
    invalidate: (key: string): void => {
      cache.delete(key)
      resolved.delete(key)
    },
    set: (key, value) => { cache.set(key, Promise.resolve(value)); resolved.set(key, value) },
    has: (key) => cache.has(key),
    preload: (seed) => {
      // hydration 种子预热（同步命中——零二次 fetch）
      for (const [k, v] of Object.entries(seed)) {
        cache.set(k, Promise.resolve(v))
        resolved.set(k, v)
      }
    },
    seed: () => Object.fromEntries(resolved),
  }
}

/** 渲染目标（统一原语） */
type Target = { kind: 'root' } | { kind: 'comp'; id: string }

/** 引擎会话（每 root 一个——P4 会话实例化） */
export class Engine {
  shadow: ShadowState = new ShadowState()
  registry = new Map<string, Node>()
  unmountHooks = new Map<string, Array<() => void>>()
  private refs = new Map<string, (el: unknown) => void>()
  currentCompId: string | null = null

  private current: VNode | null = null
  private root: HTMLElement
  ctx: Ctx
  data: DataPipe
  /** 渲染守卫 + 单槽位补跑（渲染中 render() 调用 → 记录最新目标——完成后执行一次
   *  ——不丢不排队：每个 render 请求要么立即执行（空闲）要么确保最终执行（合并到
   *  补跑——最终 DOM = 所有请求的最新状态）。渲染中窗口仅在真 await（ctx.data
   *  fetch）期间存在——同步 renderFn 时渲染是微任务链（事件在宏任务——不重叠）；
   *  真 await 期间的事件状态更新被当前 build 吸收（renderFn 恢复读最新闭包）。
   *  单槽位天然限流（事件风暴合并为一个补跑）——确定性：无队列/无微任务启动/
   *  无合并魔法——补跑执行最新目标） */
  private rendering = false
  /** 渲染中触发的目标（单槽位——最新覆盖）——null = root */
  private dirtyTarget: string[] | null | undefined

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
    this.render([compId])
  }

  unmountHooksFor(compId: string): Array<() => void> {
    let arr = this.unmountHooks.get(compId)
    if (!arr) { arr = []; this.unmountHooks.set(compId, arr) }
    return arr
  }

  /** 统一渲染原语（root/comp/语义 id——同一入口）
   *  **确定性（2026-12 决策——确定性高于 render 次数——无 magic）**：
   *  render() 调用 = 立即启动一次渲染（无微任务延迟/队列/合并——同步进入 build）；
   *  渲染中调用 → 单槽位补跑（记录最新目标——当前渲染完成后执行一次——不丢）；
   *  无外力 → 零渲染。多目标（render(['a','b'])）串行 await。 */
  render(ids?: string[]): void {
    if (this.rendering) {
      this.dirtyTarget = ids && ids.length > 0 ? ids : null // 单槽位（最新覆盖）
      return
    }
    this.rendering = true
    void (async () => {
      try {
        for (;;) {
          const t = this.dirtyTarget
          this.dirtyTarget = undefined
          if (t === undefined) {
            if (ids && ids.length > 0) {
              for (const id of ids) await this.updateComponent(id)
            } else {
              await this.updateRoot()
            }
          } else if (t === null) {
            await this.updateRoot()
          } else {
            for (const id of t) await this.updateComponent(id)
          }
          if (this.dirtyTarget === undefined) break
        }
      } catch (e) {
        console.error('[vdom4] render error:', e)
      } finally {
        this.rendering = false
      }
    })()
  }

  /** 根更新（整树——build + diff + apply） */
  private async updateRoot(): Promise<void> {
    if (!this.rootVNode) return
    const built = await buildVNode(this.rootVNode, this.ctx, this.shadow, this.current, 'root', this.createCompCtx.bind(this), true)
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
      const output = await inst.renderFn(inst.lastProps)
      const oldOut = inst.lastOutput
          if (output) {
        const built = await buildVNode(output, this.ctx, this.shadow, oldOut, `${compId}.c`, this.createCompCtx.bind(this))
        inst.nextOutput = built
        inst.outputNull = false
      } else {
        inst.nextOutput = null
        inst.outputNull = true // 输出 null——diff 用旧 lastOutput 判定——commit 时清
      }
      const cmds = diffComponent(compId, this.shadow)
      this.apply(cmds)
    } finally {
      this.currentCompId = null
    }
  }

  private apply(cmds: Command[]): void {
    const env: ApplyEnv = { registry: this.registry, shadow: this.shadow, unmountHooks: this.unmountHooks, refs: this.refs }
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

  /** 挂载（首帧——mount 时渲染守卫占用——ready 后释放——交互在 ready 后） */
  async mount(vnode: VNode): Promise<void> {
    this.rootVNode = vnode
    this.rendering = true
    try {
      const built = await buildVNode(vnode, this.ctx, this.shadow, null, 'root', this.createCompCtx.bind(this), true)
      const cmds = diffTree(built, this.shadow)
      this.apply(cmds)
      this.current = built
    } finally {
      this.rendering = false
    }
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

/** 创建应用根（vdom4 入口——options.dataSeed = hydration 种子（SSR 收集——preload
 *  预热——工厂的 ctx.data.get 同步命中——零二次 fetch）） */
export function createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown>; dataSeed?: Record<string, unknown> }): { ready: Promise<void>; unmount(): void; engine: Engine } {
  const engine = new Engine(vnode, root, options)
  if (options?.dataSeed) engine.data.preload(options.dataSeed)
  const ready = engine.mount(vnode)
  return {
    ready,
    unmount: () => engine.unmount(),
    engine,
  }
}

export { childrenOf }
