import type { ComponentType } from 'react'
import type { ClientRoute } from './client.ts'

/**
 * Type-safe route definition.
 *
 * Captures the loader return type as a phantom `$data` field.
 * Use with `useServerData<typeof route.$data>()` for auto-complete.
 *
 * @example
 * ```ts
 * const userRoute = defineRoute({
 *   path: '/users/:id',
 *   component: UserPage,
 *   loader: (params) => fetch(`/users/${params.id}?_data`).then(r => r.json()),
 * })
 * // userRoute.$data = { user: { id: number; name: string; ... } }
 *
 * // In the component:
 * const { user } = useServerData<typeof userRoute.$data>()
 * ```
 */
export function defineRoute<
  T extends Record<string, unknown> = Record<string, unknown>,
>(config: {
  path: string
  component: ComponentType
  loader: (params: Record<string, string>) => Promise<T>
}): {
  path: string
  component: ComponentType
  loader: (params: Record<string, string>) => Promise<T>
  /** Phantom type — use with `typeof route.$data` for `useServerData`. */
  $data: T
} {
  return config as unknown as ReturnType<typeof defineRoute<T>>
}
