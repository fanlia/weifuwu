/**
 * vdom v2 — 观测体系（透明机制的落地——事件记录——dev/测试用）
 *
 * 用户原则（2027-08）：**可观测是 Observable 化的核心承诺**——调试不得
 * 改源码——通过内建观测钩子记录关键链事件：
 * - obs:use-next（useObservable 源值流——hooks 值到达）
 * - req:render（段 env 的 requestRender——hooks 触发的渲染请求）
 * - sched:flush（调度流 flush——渲染执行）
 * - cmd:render（渲染流命令——diff/build 输出）
 *
 * 用法：
 *   window.__wfSpy = []（dev/测试开启——事件追加到数组）
 *   排查 = 读 __wfSpy（全链可见——任意问题可复现观测）
 */
export interface SpyEvent {
  at: number
  kind: string
  data?: string
}

/** 观测记录（全局写入点——__wfSpy 存在即开启——生产零成本） */
export function spyEvent(kind: string, data?: unknown): void {
  const w = (globalThis as { __wfSpy?: SpyEvent[] }).__wfSpy
  if (!w) return
  if (w.length < 1000) w.push({ at: Date.now() % 100000, kind, data: data === undefined ? undefined : String(data).slice(0, 80) })
}
