/**
 * vdom core — async guard（异步超时防御——R2 挂起/饿死防御——零依赖）
 *
 * 背景（ R2）：DataPipe 缓存 pending
 * promise 无超时——fetcher 永不 resolve（网络挂起/用户 promise 泄漏）→
 * `await renderFn` 永不完成 → 渲染队列饿死——应用冻结。
 *
 * 语义：
 * - **管道级放弃**（不杀底层异步）：超时 → reject（显式错误——不再永久
 *   pending——诚实语义）——底层 promise 继续跑（完成后结果丢弃——
 *   缓存语义由调用方决定：fail 缓存→invalidate 重试）
 * - 配置：createDataPipe(timeoutMs) / registry.asyncTimeout——生产默认
 *   DEFAULT_ASYNC_TIMEOUT_MS（15s）——测试注入短值（假时钟零依赖）
 * - 原生 AbortController 不可用于纯 promise 放弃（fetcher 无 signal 面）——
 *   定时器方案——零依赖契约不变
 */

/** 默认异步超时（毫秒——生产——高于移动端慢网络阈值，低于"挂起感知"阈值） */
export const DEFAULT_ASYNC_TIMEOUT_MS = 15000

/** 超时包装（ms ≤ 0 = 不超时——测试/本地禁用） */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return p
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`[vdom] 异步超时（${ms}ms）: ${label}`))
    }, ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}
