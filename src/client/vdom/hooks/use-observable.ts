/**
 * vdom hooks — useObservable 原语（env-based——hooks 内部复用 + ctx.ui 面）
 *
 * 2027-08（波次 2）——值源 hooks 的统一内层：
 * - 订阅 → 值变化 → 自动重渲染（requestRender）——getter 永远最新
 * - 幂等（同 source 引用——实例级 keyed——不重复订阅）
 * - 卸载自动退订（onUnmount）——卸载后零渲染
 */
import type { Observable } from '../observable/index.ts'
import type { HookEnv } from './env.ts'

export function useObservable<T>(env: HookEnv, source: Observable<T>, init: T): () => T {
  const data = env.getInstanceData()
  let entry = data.get(source) as { get(): T } | undefined
  if (!entry) {
    let last = init
    const sub = source.subscribe({
      next: (v) => {
        // **值变化才渲染（2027-08——对齐旧 useMedia「仅 change 渲染」语义）**：
        // initial 同步首值/同值重发——零渲染——防订阅-渲染循环（reports
        // 崩溃实证——无条件 requestRender 使 mount 期 initial 触发渲染链）
        if (v !== last) { last = v; env.requestRender() }
        else last = v
      },
      error: (e) => { console.error('[vdom] useObservable:', e) },
    })
    env.onUnmount(() => sub.unsubscribe())
    entry = { get: () => last }
    data.set(source, entry)
  }
  return () => entry!.get()
}
