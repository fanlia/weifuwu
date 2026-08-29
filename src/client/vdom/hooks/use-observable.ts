/**
 * vdom hooks — useObservable 原语（env-based——hooks 内部复用 + ctx.ui 面）
 *
 * 2027-08（波次 2）——值源 hooks 的统一内层：
 * - 订阅 → 值变化 → 自动重渲染（requestRender）——getter 永远最新
 * - 幂等（同 source 引用——实例级 keyed——不重复订阅）
 * - 卸载自动退订（onUnmount）——卸载后零渲染
 */
import type { Observable } from '../observable/index.ts'
import { Subject, throttleTime } from '../observable/index.ts'
import { spyEvent } from '../core/v2/spy.ts'
import type { HookEnv } from './env.ts'

export function useObservable<T>(env: HookEnv, source: Observable<T>, init: T, opts?: { throttleMs?: number }): () => T {
  const data = env.getInstanceData()
  let entry = data.get(source) as { get(): T; initialized?: boolean } | undefined
  if (!entry) {
    let last = init
    // **同步窗口语义（2027-08——wasInit 逻辑修复）**：
    // 订阅的同步段（fromEventPattern initial/Behavior 首值/工厂期首值）
    // = 初始化——零渲染；**同步后的一切变化 → 渲染**（含「非同步首个值」
    // ——Subject 冷源订阅后首个 next——是真实变化——必须渲染——
    // 旧 wasInit 把「首个 next」当初始化——Subject 类源断链——Affix
    // scroll 实证）
    let syncing = true
    const changes = new Subject<void>() // 变化通道（渲染通知信号源）
    const sub = source.subscribe({
      next: (v) => {
        const changed = v !== last
        last = v
        if (changed && !syncing) changes.next()
      },
      error: (e) => { console.error('[vdom] useObservable:', e) },
    })
    syncing = false
    // **高激源限帧（OBSERVABLE-OPTIMIZE 波次 4——声明式节流）**：
    // throttleMs > 0 → 变化通道经 throttleTime 限频（leading 立即 + trailing
    // 补尾——洪泛场景最新值必渲染）——getter 仍永远最新（节流只在渲染
    // 通知面——读面无损）——组合算子实现（非手写 timer）——unmount
    // 双向退订（零泄漏）
    const notify$ = opts?.throttleMs && opts.throttleMs > 0
      ? changes.asObservable().pipe(throttleTime(opts.throttleMs, { trailing: true }))
      : changes.asObservable()
    const sub2 = notify$.subscribe({ next: () => {
      spyEvent('obs:next', String(last) + ' → req:render')
      env.requestRender()
    } })
    env.onUnmount(() => { sub.unsubscribe(); sub2.unsubscribe() })
    entry = { get: () => last }
    data.set(source, entry)
  }
  return () => entry!.get()
}
