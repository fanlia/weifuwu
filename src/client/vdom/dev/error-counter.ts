/**
 * vdom dev——renderFn 错误计数哨兵（VDOM-CORE-EXCELLENCE 波次 D——2027-10）
 *
 * **自愈不可消音**：R1 熔断（renderFn throw → hole 降级 → 下一拍重试）
 * 是容错不是静默——错误必须现形且可观测（阶段 3 D1 经验：错误计数 0 为
 * 基线、非 0 现形）。
 *
 * ① **日志去重**（Icon 类回归案实证：mode 循环重试——每次 renderFn throw
 *   都 console.error——日志风暴掩盖根因）——同 compId 错误只报一次，
 *   恢复成功后清出（再错再报——错误状态变化可观测）
 * ② **错误计数**：total（累计）+ byComp（Map compId → count）——
 *   render-health snapshot.errors 轴（dev 仪表四轴——频率/规模/复用/错误）
 *
 * dev only（调用方 __WF_DEV__ 门控——生产零成本——错误走 console.error
 * 原生路径由运行时收集）
 */

/**
 * **globalThis 单例（跨模块实例共享——2027-10 实证）**：不同导入路径
 * 解析（strip-types URL 规范化差异）会产生模块双实例——计数/去重状态
 * 分裂（note 计了 snapshot 看不到——fuzz 排障同款教训）——dev 哨兵
 * 本就是全局单例语义——挂 globalThis 保证跨实例一致
 */
interface ErrState {
  errState: Map<string, { shown: boolean; count: number }>
  totalErrors: number
}
const g = globalThis as unknown as { __wfErrState?: ErrState }
if (!g.__wfErrState) g.__wfErrState = { errState: new Map(), totalErrors: 0 }
const { errState, totalErrorsRef } = { errState: g.__wfErrState.errState, totalErrorsRef: g.__wfErrState }
const totalErrors = { get: () => totalErrorsRef.totalErrors, inc: () => { totalErrorsRef.totalErrors++ }, reset: () => { totalErrorsRef.totalErrors = 0 } }

/** renderFn throw 时调用（component.ts renderFn catch / diff.ts rerenderSegment catch）*/
export function noteRenderError(compId: string, e: unknown): void {
  totalErrors.inc()
  const st = errState.get(compId)
  if (st) {
    st.count++
    // 已报过 → 静默（去重——循环重试不刷日志）
    return
  }
  errState.set(compId, { shown: true, count: 1 })
  console.error(`[vdom] renderFn 错误（${compId}）——组件级 hole 降级（下一拍重试自愈）:`, e)
}

/** renderFn 成功时调用（恢复清出——再错再报） */
export function clearRenderError(compId: string): void {
  errState.delete(compId)
}

/** 错误快照（render-health snapshot.errors 轴） */
export function errorSnapshot(): { total: number; byComp: Record<string, number> } {
  const byComp: Record<string, number> = {}
  for (const [k, v] of errState) byComp[k] = v.count
  return { total: totalErrors.get(), byComp }
}

/** 测试隔离重置（仅测试用） */
export function resetErrorCounter(): void {
  errState.clear()
  totalErrors.reset()
}
