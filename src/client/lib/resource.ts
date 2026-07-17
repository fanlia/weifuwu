/**
 * createResource — 异步数据资源管理
 *
 * 自动管理 loading / error / data 三态，与 Show/For 天然配合。
 * 数据获取时自动设 loading=true，完成后设 loading=false。
 *
 * ```tsx
 * import { createResource, Show, For } from 'weifuwu/client'
 *
 * function PostList(_, ctx) {
 *   const [posts, { loading, error, refetch }] = createResource(async () => {
 *     return ctx.api.get('/api/posts')
 *   })
 *
 *   return (
 *     <div>
 *       <Show when={loading}><p>加载中...</p></Show>
 *       <Show when={error}><p>出错了: {error.value?.message}</p></Show>
 *       <For each={posts}>{(post) => <PostCard post={post} />}</For>
 *     </div>
 *   )
 * }
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

/**
 * 创建异步数据资源。
 *
 * @param fetcher 异步数据获取函数，首次调用在 createResource() 时立即执行
 * @returns { data, loading, error, refetch }
 *
 * 所有返回值都是 Signal，可直接在 JSX 中使用：
 * ```tsx
 * <Show when={loading}><Skeleton /></Show>
 * <Show when={error}><Error /></Show>
 * <For each={data}>{(item) => ...}</For>
 * ```
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
): ResourceReturn<T> {
  const data = signal<T | undefined>(undefined)
  const loading = signal(true)
  const error = signal<Error | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      data.value = await fetcher()
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  // 立即执行首次加载
  load()

  return { data, loading, error, refetch: load }
}
