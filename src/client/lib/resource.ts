/**
 * createResource — 异步数据资源管理
 *
 * 自动管理 loading / error / data 三态，与 Show/For 天然配合。
 * 支持自动重试和超时。
 *
 * ```tsx
 * import { createResource, Show, For } from 'weifuwu/client'
 *
 * // 基本用法
 * const [posts, { loading, error }] = createResource(async () => {
 *   return ctx.api.get('/api/posts')
 * })
 *
 * // 自动重试 3 次 + 5 秒超时
 * const [data, { loading, error }] = createResource(fetcher, {
 *   retry: 3,
 *   timeout: 5000,
 * })
 *
 * // 在 JSX 中使用
 * <Show when={loading}><p>加载中...</p></Show>
 * <Show when={error}><p>出错了: {error.value?.message}</p></Show>
 * <For each={posts}>{(post) => <PostCard post={post} />}</For>
 * ```
 */

import { signal } from '../signal.ts'
import type { Signal } from '../signal.ts'

export interface ResourceReturn<T> {
  /** 数据信号（初始为 undefined，加载成功后更新） */
  data: Signal<T | undefined>
  /** 是否正在加载 */
  loading: Signal<boolean>
  /** 错误信号（加载失败时设置） */
  error: Signal<Error | null>
  /** 手动重新获取数据 */
  refetch: () => void
}

export interface ResourceOptions {
  /** 失败时自动重试次数，默认 0（不重试） */
  retry?: number
  /** 每次重试的延迟（毫秒），默认 1000 */
  retryDelay?: number
  /** 单次请求超时（毫秒），默认 0（不超时） */
  timeout?: number
}

/**
 * 创建异步数据资源。
 *
 * @param fetcher 异步数据获取函数
 * @param opts 可选配置 { retry, retryDelay, timeout }
 * @returns { data, loading, error, refetch }
 *
 * 首次调用在 createResource() 时立即执行。
 * 所有返回值都是 Signal，可直接在 JSX 中使用。
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
  opts: ResourceOptions = {},
): ResourceReturn<T> {
  const data = signal<T | undefined>(undefined)
  const loading = signal(true)
  const error = signal<Error | null>(null)

  const { retry = 0, retryDelay = 1000, timeout = 0 } = opts

  async function load() {
    loading.value = true
    error.value = null

    let lastError: Error | null = null
    let attempt = 0

    while (attempt <= retry) {
      try {
        let result: T

        if (timeout > 0) {
          // 带超时的请求
          const withTimeout = Promise.race([
            fetcher(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`请求超时 (${timeout}ms)`)), timeout)
            ),
          ])
          result = await withTimeout
        } else {
          result = await fetcher()
        }

        data.value = result
        error.value = null
        loading.value = false
        return
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        attempt++

        if (attempt <= retry) {
          // 等待重试延迟
          await new Promise(r => setTimeout(r, retryDelay))
        }
      }
    }

    // 所有重试都失败
    error.value = lastError
    loading.value = false
  }

  // 立即执行首次加载
  load()

  return { data, loading, error, refetch: load }
}
