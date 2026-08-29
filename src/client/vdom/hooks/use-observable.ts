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
  let entry = data.get(source) as { get(): T; initialized?: boolean } | undefined
  if (!entry) {
    let last = init
    let initialized = false // **首次订阅（同步首值）不渲染**——首值 = 初始化
    const sub = source.subscribe({
      next: (v) => {
        const wasInit = initialized
        initialized = true
        const changed = v !== last
        last = v
        // **值变化才渲染（2027-08）**：
        // ① 同步首值（订阅时 initial 发射）零渲染（reports 崩溃实证）
        // ② 工厂期首值有变化（vv: 0→800）——仍属初始化——不渲染
        // ③ **首值之后的变化（wasInit=true）→ 渲染**（use-media 视口变化
        //    回归——wasInit 逻辑修正：首值后变化才渲染——非「首值前」）
        if (changed && wasInit) env.requestRender()
      },
      error: (e) => { console.error('[vdom] useObservable:', e) },
    })
    env.onUnmount(() => sub.unsubscribe())
    entry = { get: () => last, initialized }
    data.set(source, entry)
  }
  return () => entry!.get()
}
