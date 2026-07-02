import type { ComponentType } from 'react'

/**
 * Type-safe route definition.
 *
 * Captures the loader return type as a phantom `$data` field.
 * Use with `useServerData<typeof route.$data>()` for auto-complete.
 *
 * `component` accepts either a ComponentType or a string path (resolved via registerComponent).
 *
 * @example
 * ```ts
 * const userRoute = defineRoute({
 *   path: '/users/:id',
 *   component: './components/UserDetailPage.tsx',
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
  component: ComponentType | string
  loader: (params: Record<string, string>) => Promise<T>
}): {
  path: string
  component: ComponentType | string
  loader: (params: Record<string, string>) => Promise<T>
  /** Phantom type — use with `typeof route.$data` for `useServerData`. */
  $data: T
}

/** Overload for routes without a loader. */
export function defineRoute(config: {
  path: string
  component: ComponentType | string
  loader?: undefined
}): {
  path: string
  component: ComponentType | string
  loader?: undefined
  $data: Record<string, unknown>
}

export function defineRoute(config: {
  path: string
  component: ComponentType | string
  loader?: (params: Record<string, string>) => any
}): any {
  return config as any
}
