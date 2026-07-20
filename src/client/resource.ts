/**
 * weifuwu/client createResource — 异步数据资源管理
 *
 * 自动管理 loading / error / data 信号，
 * 支持依赖追踪（signal 变化时自动 refetch）。
 *
 * ```ts
 * const userId = signal(1)
 * const [user, { loading, error, refetch }] = createResource(
 *   () => fetch(`/api/users/${userId.value}`).then(r => r.json()),
 *   { initialValue: null }
 * )
 *
 * // 在 JSX 中：
 * <Show when={loading}><p>加载中...</p></Show>
 * <Show when={error}><p>错误: {error.value?.message}</p></Show>
 * <Show when={!loading && !error.value}>
 *   <p>用户: {user.value?.name}</p>
 * </Show>
 * ```
 */

import { signal, computed, effect, type Signal } from './signal.ts'

export interface ResourceOptions<T> {
  /** 初始值（可选，默认为 undefined） */
  initialValue?: T
}

/** createResource 返回的元组第二项：状态对象 */
export interface ResourceState<T> {
  /** 是否正在加载 */
  loading: Signal<boolean>
  /** 错误信号（加载失败时） */
  error: Signal<Error | undefined>
  /** 手动重新 fetch */
  refetch: () => void
  /** 数据信号（与元组第一项相同） */
  data: Signal<T | undefined>
}

/**
 * 创建异步数据资源 — 自动管理 loading/error/data 信号。
 *
 * 返回 [data, state] 元组，支持 SolidJS 风格解构：
 * ```ts
 * const userId = signal(1)
 * const [user, { loading, error, refetch }] = createResource(
 *   () => fetch('/api/users/' + userId.value).then(r => r.json())
 * )
 * // userId 变化时自动重新 fetch
 * ```
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>,
): [Signal<T | undefined>, ResourceState<T>] {
  const data = signal<T | undefined>(options?.initialValue)
  const loading = signal<boolean>(true)
  const error = signal<Error | undefined>(undefined)

  let fetchId = 0

  async function load() {
    const id = ++fetchId
    loading.value = true
    error.value = undefined

    try {
      const result = await fetcher()
      if (id === fetchId) {
        data.value = result
        loading.value = false
      }
    } catch (e) {
      if (id === fetchId) {
        error.value = e instanceof Error ? e : new Error(String(e))
        loading.value = false
      }
    }
  }

  load()

  const state: ResourceState<T> = {
    data,
    loading,
    error,
    refetch: () => { load() },
  }

  return [data, state]
}
