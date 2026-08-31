/**
 * vdom dev — 渲染健康诊断器（RENDER-HEALTH-PLAN 波次 1——三轴仪表）
 *
 * 问题：渲染的健康缺少度量与防线——频率/规模/复用失败率全靠用户报 +
 * 每次重查。诊断器 = **问题出现即读数**（不再盲查）。
 *
 * 机制（dev only——__WF_DEV__ 门控——生产零成本）：
 * - **频率**：渲染次数/时间窗（渲染周期完成信号——complete$ 事件计数）
 * - **规模**：单次渲染命令数（applied$ 的 cmds.length）
 * - **复用**：工厂重跑率（seg:create / seg:reuse spy 事件——引擎零侵入
 *   ——spyEvent 已门控）——重跑率 = create / (create + reuse)
 * - 输出：window.__wfRenderHealth（每 2s 滚动）+ 阈值 warn
 *   （频率 > 10/s · 单渲染 > 300ms · 复用率 < 95%——超阈值即警——
 *   同 effect-guard 模式——开发期红线）
 *
 * 接线（serve.ts）：`__WF_DEV__` 时 createRenderHealth(cycle, segments)
 */
import type { Command } from '../core/command/index.ts'
import type { Observable } from '../observable/index.ts'
import { spyEvent } from '../core/v2/spy.ts'
import type { SegmentMap } from '../core/v2/diff.ts'

export interface RenderHealthSnapshot {
  /** 频率轴：渲染次数/秒（滚动窗口） */
  fps: number
  /** 规模轴：单次渲染命令数（上次值 + 最大） */
  lastCmds: number
  maxCmds: number
  /** 复用轴：工厂重跑率（seg:create 占比——0.95 = 95%） */
  reRunRate: number
  /** 当前存活段数 */
  segments: number
  /** 累计（时间线） */
  total: { renders: number; cmds: number; creates: number; reuses: number }
  /** 阈值告警（空 = 健康） */
  warns: string[]
}

export interface RenderHealth {
  /** 当前读数（window.__wfRenderHealth 形态） */
  snapshot(): RenderHealthSnapshot
  /** 刷新滚动窗口（内部每 2s 自动） */
  refresh(): void
  /** 停止（unmount——窗口清空） */
  dispose(): void
}

const WINDOW_MS = 2000
const MAX_CMDS_WARN = 5000
const MAX_FPS_WARN = 10
const MAX_RERUN_WARN = 0.05 // 5% 重跑率
const MAX_MS_WARN = 300

/** 创建诊断器（dev only——调用方门控）——订阅周期流 + spy 事件 */
export function createRenderHealth(
  applied$: Observable<Command[]>,
  complete$: Observable<void>,
  segments: SegmentMap,
  getSpy?: () => { kind: string }[],
): RenderHealth {
  // **复用轴数据源二选一**：优先 spy 事件流（seg:create/reuse——引擎插桩）
  // ——getSpy 缺省时读 window.__wfSpy（dev 已开）
  const readsSpy = () => getSpy?.() ?? ((globalThis as { __wfSpy?: { kind: string }[] }).__wfSpy ?? [])
  let renders = 0
  let cmdsAll = 0
  let creates = 0
  let reuses = 0
  let lastCmds = 0
  let maxCmds = 0
  let lastRenderAt = 0
  let lastMs = 0
  let maxMs = 0
  let windowRenders = 0
  const warns: string[] = []

  applied$.subscribe({ next: (cmds) => {
    lastCmds = cmds.length
    maxCmds = Math.max(maxCmds, cmds.length)
    cmdsAll += cmds.length
  } })
  complete$.subscribe({ next: () => {
    renders++
    windowRenders++
    if (lastRenderAt > 0) lastMs = performanceNow() - lastRenderAt
    if (lastMs > maxMs) maxMs = lastMs
    lastRenderAt = performanceNow()
    // **渲染后即时 publish（2027-10 F2 接审计实证）**：短生命周期页面
    // （SSR 快扫/测试 <2s 退出）读不到 2s tick 快照——每次渲染后快照
    // 即时刷新（窗口语义不变——refresh 仍 2s 清窗计频）
    publish()
  } })

  // **复用轴（spy 事件聚合——seg:create/seg:reuse）**——全量快照计数
  // （__wfSpy 1000 条截断时计数下探——reRunRate 高报——warn 引导即可）
  const scanSpy = (): void => {
    let c = 0
    let r = 0
    for (const e of readsSpy()) {
      if (e.kind === 'seg:create') c++
      else if (e.kind === 'seg:reuse') r++
    }
    creates = c
    reuses = r
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const refresh = (): void => {
    scanSpy()
    const fps = windowRenders / (WINDOW_MS / 1000)
    const reRunRate = creates + reuses > 0 ? creates / (creates + reuses) : 0
    warns.length = 0
    if (fps > MAX_FPS_WARN) warns.push(`频率超限：${fps.toFixed(1)} 渲染/s（> ${MAX_FPS_WARN}）`)
    if (lastCmds > MAX_CMDS_WARN) warns.push(`规模超限：单渲染 ${lastCmds} 命令（> ${MAX_CMDS_WARN}）`)
    if (maxMs > MAX_MS_WARN) warns.push(`渲染耗时超限：${maxMs}ms（> ${MAX_MS_WARN}）`)
    if (reRunRate > MAX_RERUN_WARN) warns.push(`复用率不足：重跑率 ${(reRunRate * 100).toFixed(1)}%（> ${MAX_RERUN_WARN * 100}%）`)
    for (const w of warns) console.warn(`[vdom-dev] 渲染健康：${w}`)
    windowRenders = 0
    publish()
  }
  const publish = (): void => {
    const reRunRate = creates + reuses > 0 ? creates / (creates + reuses) : 0
    const snap: RenderHealthSnapshot = {
      fps: windowRenders / (WINDOW_MS / 1000),
      lastCmds, maxCmds,
      reRunRate,
      segments: segments?.size ?? 0,
      total: { renders, cmds: cmdsAll, creates, reuses },
      warns: [...warns],
    }
    ;(globalThis as { __wfRenderHealth?: RenderHealthSnapshot }).__wfRenderHealth = snap
  }
  publish() // 挂载即发初始快照（窗口空零值——审计/诊断器立即可读——否则首 2s 为 undefined）
  timer = setInterval(refresh, WINDOW_MS)

  return {
    snapshot: () => {
      scanSpy()
      const reRunRate = creates + reuses > 0 ? creates / (creates + reuses) : 0
      return {
        fps: windowRenders / (WINDOW_MS / 1000),
        lastCmds, maxCmds,
        reRunRate,
        segments: segments?.size ?? 0,
        total: { renders, cmds: cmdsAll, creates, reuses },
        warns: [...warns],
      }
    },
    refresh,
    dispose: () => { if (timer) { clearInterval(timer); timer = null } },
  }
}

function performanceNow(): number {
  return (globalThis as { performance?: { now(): number } }).performance?.now?.() ?? Date.now()
}

/** serve 挂载（dev only——__WF_DEV__ 门控——生产零成本）——导出供接线 */
export function enableRenderHealth(opts: {
  applied$: Observable<Command[]>
  complete$: Observable<void>
  segments: SegmentMap
}): RenderHealth {
  const h = createRenderHealth(opts.applied$, opts.complete$, opts.segments)
  spyEvent('health:attached')
  return h
}
