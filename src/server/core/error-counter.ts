/**
 * server core——handler 错误计数哨兵（ROUTER-CORE 波次 C1——2027-10）
 *
 * **自愈不可消音**（vdom error-counter 同思想——VDOM-CORE D 波次移植）：
 * handleError 的 console.error 是现形机制——**同路由错误风暴去重**
 * （C1 探针实证：100 次同错 100 条日志——循环重试/客户端重放场景
 * 掩盖根因——同路由错误只报一次，恢复后清出再报）。
 *
 * ① 日志去重：key = `${method} ${pathname}`（路由级——非请求级）
 * ② 恢复清出：该路由后续请求正常完成（无 throw）时清出——错误状态
 *    变化可观测（再错再报）
 * ③ 计数：total + byRoute——可观测面（诊断/仪表接入点）
 *
 * **globalThis 单例**（vdom 同款——strip-types URL 规范化差异产生模块
 * 双实例——计数状态分裂——全局单例语义挂 globalThis）
 */
interface ErrState {
  errState: Map<string, { shown: boolean; count: number }>
  totalErrors: number
}
const g = globalThis as unknown as { __wfRouterErrState?: ErrState }
if (!g.__wfRouterErrState) g.__wfRouterErrState = { errState: new Map(), totalErrors: 0 }
const state = g.__wfRouterErrState

/** handler 链 throw 时调用（router.ts handleError——console.error 去重门） */
export function noteHandlerError(routeKey: string, e: unknown): void {
  state.totalErrors++
  const st = state.errState.get(routeKey)
  if (st) {
    st.count++
    return // 已报过 → 静默（去重——风暴不刷日志）
  }
  state.errState.set(routeKey, { shown: true, count: 1 })
  console.error(`[router] ${routeKey}（重复错误已去重——累计 ${state.totalErrors}）:`, e instanceof Error ? e.stack || e.message : e)
}

/** 该路由请求正常完成时调用（恢复清出——再错再报） */
export function clearHandlerError(routeKey: string): void {
  state.errState.delete(routeKey)
}

/** 可观测面（诊断/仪表接入点——total + byRoute 快照） */
export function errorSnapshot(): { total: number; byRoute: Record<string, number> } {
  const byRoute: Record<string, number> = {}
  for (const [k, v] of state.errState) byRoute[k] = v.count
  return { total: state.totalErrors, byRoute }
}

/** 测试复位 */
export function resetErrorCounter(): void {
  state.errState.clear()
  state.totalErrors = 0
}
