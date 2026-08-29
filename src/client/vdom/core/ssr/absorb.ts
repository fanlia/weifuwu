/**
 * vdom core/ssr — absorb（SSR 结构吸收状态机）
 *
 * 首帧结构对齐：SSR 输出静态 HTML → 客户端 uiServe 接管——create 命令
 * 按 DFS 序消费 SSR 节点（类型匹配复用——焦点/状态保持——零重建）。
 *
 * 职责边界（中转——命令分发细节在 processors——本文件只持有状态 +
 * 匹配判定）：
 * - begin（DFS 序快照——不消费 root 自身）
 * - next（匹配消费——元素按 tag 匹配 / 文本 / 注释锚——不匹配跳过）
 * - end（done.full 收尾——剩余节点 = SSR 输出多于命令 → mismatch）
 * - failed（serve 检测回退清空重建——原子性）
 *
 * 确定性前提（诚实裁剪）：SSR 与客户端首帧必须同构（同路由同组件——
 * 渲染期非确定（Date/Math.random）→ mismatch → 回退重建——dev 检测）。
 */
/** 吸收状态机（**状态机化——非法调用顺序显式 Reject**）：
 *  inactive → begin → consuming →（end/next 耗尽）→ inactive/failed
 *  - begin：inactive → consuming（DFS 序快照）
 *  - next：consuming → consuming（消费）/ failed（队列耗尽）
 *  - end：consuming → inactive（无剩余）/ failed（剩余 = mismatch）
 *  - reset：任意 → inactive（回退重建）
 *  违例（静默路径歼灭——审计 2026-XX）：next/end 在 inactive 调用 →
 *  显式 console.error（不再静默返回 null——非法顺序是 bug）
 */
import type { WfNode } from '../patch/processors.ts'
import { Subject, scan, filter, map, type Observable } from '../../observable/index.ts'

/** 吸收阶段（状态机枚举） */
export type AbsorbPhase = 'inactive' | 'consuming' | 'failed'

/** 吸收迁移事件（**流化（2027-09）——事件序列 = 时间线——可回放**） */
export type AbsorbEvent =
  | { kind: 'begin' }
  | { kind: 'next'; matched: boolean }   // matched=true 消耗命中；false = 队列耗尽（SSR 内容不足）
  | { kind: 'end'; remaining: number }   // remaining>0 = mismatch（SSR 多于命令）
  | { kind: 'reset' }

/** 吸收迁移表（**纯 reducer——状态机维度总表语义不变——波次 4 流化**）：
 *  - begin：任意 → consuming（无条件——幂等——现状）
 *  - next matched：consuming → consuming（消耗）；matched=false = 耗尽——failed
 *  - end：consuming → remaining>0 ? failed : inactive（mismatch 判定）
 *  - reset：任意 → inactive（回退重建）
 *  违例语义（保持现状——不抛——消费端防御）：next/end 于非 consuming =
 *  无迁移（合法 no-op——procDone 无条件调用 end——未 begin 不报错）——
 *  next 违例的方法层保留 console.error（audit 可见——2026 审计语义） */
export function absorbReducer(s: AbsorbPhase, e: AbsorbEvent): AbsorbPhase {
  switch (e.kind) {
    case 'begin': return 'consuming'
    case 'next': return e.matched ? 'consuming' : 'failed'
    case 'end': return s === 'consuming' ? (e.remaining > 0 ? 'failed' : 'inactive') : s
    case 'reset': return 'inactive'
  }
}

/** 吸收状态（CommandApplier 持有——apply 层消费） */
export class AbsorbState {
  /** DFS 序快照（root 后代——create 按序消费） */
  queue: Node[] | null = null
  /** 状态机阶段（**单源 = events$ 的 scan 折叠写回**——2027-09） */
  phase: AbsorbPhase = 'inactive'
  /** 迁移事件流（begin/next/end/reset 全序列——**时间线可回放**） */
  readonly events$: Observable<AbsorbEvent>
  /** **吸收失败事件**（next 耗尽 / end 剩余——serve 回退闭环订阅点） */
  readonly failed$: Observable<void>
  private readonly events = new Subject<AbsorbEvent>()

  constructor() {
    this.events$ = this.events.asObservable()
    // **相位折叠（单源——状态 = 事件的 scan——方法不再手写 phase 迁移）**
    this.events.asObservable().pipe(scan(absorbReducer, 'inactive')).subscribe({ next: (p) => { this.phase = p } })
    // **failed$（迁移派生——next 耗尽 / end 剩余）**
    this.failed$ = this.events.asObservable().pipe(
      filter((e) => (e.kind === 'next' && !e.matched) || (e.kind === 'end' && e.remaining > 0)),
      map(() => void 0),
    )
  }

  /** 启动吸收（root 有 SSR 内容——DFS 序快照——不消费 root 自身） */
  begin(container: HTMLElement): void {
    const q: Node[] = []
    const walk = (n: Node): void => {
      q.push(n)
      for (const c of n.childNodes) walk(c)
    }
    for (const c of container.childNodes) walk(c)
    this.queue = q
    this.events.next({ kind: 'begin' })
  }

  /** 吸收结束（done.full）——剩余节点 = SSR 输出多于命令——mismatch
   *  **inactive 时 = 合法 no-op**（procDone 无条件调用——非 SSR 客户端
   *  渲染未 begin——end 无意义——不报错——reducer 无迁移）；consuming 时 =
   *  正常收尾（remaining=0 → inactive / >0 → failed 事件） */
  end(): void {
    if (this.phase !== 'consuming') return // 未 begin——合法 no-op
    const remaining = this.queue?.length ?? 0
    this.queue = null
    this.events.next({ kind: 'end', remaining })
  }

  /** 重置（回退重建后——恢复非吸收态） */
  reset(): void {
    this.queue = null
    this.events.next({ kind: 'reset' })
  }

  /** 吸收消费（create 族——匹配下一个 SSR 节点——类型不符/耗尽 → 失败）
   *  **文本分裂（2026-08——SSR 相邻文本合流实战）**：HTML 序列化会把
   *  相邻 createText 合并成一个 DOM 文本节点（如 ` › ` + `InputNumber`
   *  → `" › InputNumber"`）——但客户端命令流是两条 createText——按整节点
   *  消费会吞掉后缀（后续 next 找不到文本 → 耗尽 failed）→ 前缀匹配 +
   *  splitText 分裂：剩余部分 unshift 回队列头部——命令流 1:1 对齐
   *  （procCreateText 传目标 value——prefix 判定） */
  next(kind: 'element' | 'text' | 'comment', tag?: string, value?: string): WfNode | null {
    // **状态机违例（审计）**：未 begin 的 next ——显式报错（不再静默 null）
    if (this.phase !== 'consuming') {
      console.error(`[vdom] absorb 状态机违例：next 在 ${this.phase} 阶段调用（应 consuming）`)
      return null
    }
    const q = this.queue
    if (!q) return null
    while (q.length > 0) {
      const n = q.shift()!
      const ok = kind === 'element'
        ? n.nodeType === 1 && (n as Element).tagName.toLowerCase() === tag
        : kind === 'text' ? n.nodeType === 3 : n.nodeType === 8
      if (ok) {
        if (kind === 'text' && value !== undefined) {
          const t = n as Text
          const cur = t.textContent ?? ''
          if (cur !== value && cur.startsWith(value)) {
            // 前缀命中——分裂：剩余部分成为独立文本节点（紧跟原节点）——
            // unshift 回队列头部——下一条 createText 继续消费
            const rem = t.splitText(value.length)
            q.unshift(rem)
          }
        }
        this.events.next({ kind: 'next', matched: true }) // 命中事件（时间线完整）
        return n as WfNode
      }
      // 不匹配节点（SSR 额外内容——如注释/空白文本）——跳过继续
      // （跳过无状态迁移——不发事件——事件时间线只记迁移）
    }
    // 队列耗尽——SSR 内容不足——吸收失败（failed$ 事件——serve 回退清空重建）
    this.events.next({ kind: 'next', matched: false })
    return null
  }
}
