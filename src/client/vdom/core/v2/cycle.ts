/**
 * vdom v2 — 渲染周期（applyV2Inner 管线化——波次 1：渲染全链路流视图）
 *
 * VDOM-OBSERVABLE-COMPLETE 波次 1：
 * - **管线形态**：build/diff → cmds$ → toArray（原子性——生成完成才应用——
 *   错误 → 零 DOM 变更）→ tap(apply) → tap(cleanup) → currentTree →
 *   applied$（sink 可观测）→ complete$
 * - **度量流化**：三轴（builds/diffs/applies/unmounts）在周期计数——
 *   删除 applyV2 手写 vt.builds/diffs（serve 同步到 __wfV2——兼容）
 * - **sserve 解耦**：周期不含 DOM/applier——依赖注入（boot/resetRoot/
 *   build/diff/apply/dispose/active）——契约层可注入假依赖直测管线
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import { Observable, Subject, tap, toArray } from '../../observable/index.ts'
import { spyEvent } from './spy.ts'
import { nextSegmentEpoch } from './diff.ts'

/** 周期三轴度量（渲染健康——流上取数——RENDER-HEALTH-PLAN 接管点） */
export interface CycleMetrics {
  builds: number
  diffs: number
  applies: number
  unmounts: number
}

/** 渲染周期依赖（serve 注入 DOM/引擎——周期纯管线） */
export interface RenderCycleDeps {
  /** 首帧一次性（SSR 吸收 begin / root 清空——周期内 booted 标记） */
  boot(): void
  /** root 整树替换前清空（innerHTML='' + 旧段全量 dispose——serve 实现） */
  resetRoot(): void
  /** 全量构建（首帧 / 根替换 / 影子树重置后——currentTree null 时） */
  build(vnode: VNode): Observable<Command>
  /** 增量 diff（currentTree 与 vnode 同型） */
  diff(oldTree: VNode, nextTree: VNode): Observable<Command>
  /** 命令应用（applier.apply——副作用终态） */
  apply(cmd: Command): void
  /** unmount 命令 → 段销毁（返回是否实际销毁——幂等防御）。
   *  **beforeEpoch（2027-10——nav 链残留实修补正）**：只处理「该周期之前」
   *  创建的段——unmount 目标永远是旧树段——同槽位 id 复用的新段不是目标 */
  dispose(compId: string, beforeEpoch: number): boolean
  /** serve 活性（unmount 后周期零副作用） */
  active(): boolean
}

export interface RenderCycle {
  /** 应用 vnode（首帧 build / 后续 diff / 异型根替换）——生成原子性 */
  apply(vnode: VNode): Promise<void>
  /** 影子树重置（错误自愈 / R1 熔断 fallback 前置）——下次 apply 全量 */
  reset(): void
  /** 三轴度量（builds/diffs/applies/unmounts） */
  metrics(): CycleMetrics
  /** **应用后命令重发射**（sink 可观测——dev/度量订阅点——每周期一值） */
  applied$: Observable<Command[]>
  /** **周期完成**（applied 后——afterRender 冲刷点——每周期一事件） */
  complete$: Observable<void>
}

/** 创建渲染周期（**原子性纪律**：命令生成完整（toArray）→ 应用——生成
 *  错误 → 零 DOM 变更 + currentTree 重置（下次全量自愈——R1 语境界面）） */
export function createRenderCycle(deps: RenderCycleDeps): RenderCycle {
  let booted = false
  let currentTree: VNode | null = null
  const metrics: CycleMetrics = { builds: 0, diffs: 0, applies: 0, unmounts: 0 }
  const appliedSub = new Subject<Command[]>()
  const completeSub = new Subject<void>()

  // **应用（tap——命令逐个应用——apply 错误 = break（后续命令跳过——
  // 现有语义）——影子树保持（周期推进）——错误不终结管线（cleanup 仍执行）**
  const applyCmds = (cmds: Command[]): void => {
    if (!deps.active()) return
    for (const cmd of cmds) {
      try { metrics.applies++; deps.apply(cmd) }
      catch (e) { console.error('[vdom] v2 apply:', e); break }
    }
  }
  // **清理（unmount 命令 → 段销毁——幂等——生成端已统一 dispose 的防御
  //  性消费端路径）**——**纪元守卫（2027-10）**：unmount 目标永远是旧树段
  //  （生成期已 dispose 的除外）——同周期新挂载的同 id 段（槽位复用——
  //  nav 链 accordion→index→actionsheet 残留实证：nav1 的 unmount
  //  root.0.1.0 在 cleanup 阶段误杀当期新挂载的 index 段 → nav2 旧输出
  //  无清理命令 → 组件列表残留）——纪元 < 当前周期才销毁
  const cleanupCmds = (cmds: Command[], beforeEpoch: number): void => {
    if (!deps.active()) return
    for (const cmd of cmds) {
      if (cmd.op === 'unmount' && deps.dispose(cmd.compId, beforeEpoch)) metrics.unmounts++
    }
  }

  const apply = (vnode: VNode): Promise<void> => new Promise<void>((resolve, reject) => {
    if (!deps.active()) { resolve(); return }
    // **周期纪元（2027-10）**：本周期创建的段打上当前纪元——cleanup 以
    //  纪元为界（不误杀当期新建段）
    const beforeEpoch = nextSegmentEpoch()
    let stream: Observable<Command>
    if (!booted) {
      booted = true
      try { deps.boot() } catch (e) { reject(e); return }
    }
    if (currentTree === null) {
      metrics.builds++
      stream = deps.build(vnode)
    } else if (currentTree.type !== vnode.type) {
      // **root 整树替换**（组件/元素切换——异型走转换表会违例——清空重建）
      metrics.builds++
      try { deps.resetRoot() } catch (e) { reject(e); return }
      currentTree = null
      stream = deps.build(vnode)
    } else {
      metrics.diffs++
      stream = deps.diff(currentTree, vnode)
    }
    stream.pipe(
      toArray(),
      tap((cmds) => spyEvent('cmd:render', `${cmds.length}条`)),
      tap(applyCmds),
      tap((cmds) => cleanupCmds(cmds, beforeEpoch)),
      tap((cmds) => { if (deps.active()) currentTree = vnode; void cmds }),
    ).subscribe({
      next: (cmds) => {
        if (!deps.active()) { resolve(); return }
        appliedSub.next(cmds)
        completeSub.next()
        resolve()
      },
      error: (e) => { currentTree = null; reject(e) },
    })
  })

  const reset = (): void => { currentTree = null }

  return {
    apply,
    reset,
    metrics: () => ({ ...metrics }),
    applied$: appliedSub.asObservable(),
    complete$: completeSub.asObservable(),
  }
}
