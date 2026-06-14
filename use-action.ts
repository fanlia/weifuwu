/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef } from 'react'

/** Options for {@link useAction}. */
export interface UseActionOptions<T = any> {
  /** HTTP method (default: `'POST'`). */
  method?: string
  /** Additional request headers. */
  headers?: Record<string, string>
  /** Called with the response data on success. */
  onSuccess?: (data: T) => void
  /** Called with the error on failure. */
  onError?: (err: Error) => void
}

/** Return value of {@link useAction}. */
export interface UseActionReturn<T = any> {
  /** Submit the action. Pass a body to send as JSON (or FormData). */
  submit: (body?: any) => Promise<T | undefined>
  /** Response data from the last successful submission. */
  data: T | null
  /** Error from the last failed submission. */
  error: Error | null
  /** Whether a submission is in progress. */
  pending: boolean
  /** Reset data and error to their initial states. */
  reset: () => void
}

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Hook to submit form actions via `fetch`. Handles JSON serialization,
 * CSRF token injection, and loading/error state.
 *
 * ```tsx
 * import { useAction } from 'weifuwu/react'
 *
 * function SaveButton() {
 *   const { submit, pending, error } = useAction('/api/save')
 *   return (
 *     <button onClick={() => submit({ title: 'Hello' })} disabled={pending}>
 *       {pending ? 'Saving...' : 'Save'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useAction<T = any>(
  url: string | URL,
  options?: UseActionOptions<T>,
): UseActionReturn<T> {
  const { method = 'POST', headers, onSuccess, onError } = options ?? {}
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [pending, setPending] = useState(false)
  const mountedRef = useRef(true)

  const submit = useCallback(
    async (body?: any): Promise<T | undefined> => {
      setPending(true)
      setError(null)

      try {
        const csrfToken = getCsrfToken()
        const hdrs: Record<string, string> = { ...headers }
        if (csrfToken) hdrs['x-csrf-token'] = csrfToken
        if (body && typeof body === 'object' && !(body instanceof FormData)) {
          hdrs['content-type'] = 'application/json'
        }

        const res = await fetch(url, {
          method,
          headers: hdrs,
          body:
            body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }

        const result = res.status === 204 ? (undefined as any) : ((await res.json()) as T)

        if (mountedRef.current) {
          setData(result)
          onSuccess?.(result)
        }

        return result
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        if (mountedRef.current) {
          setError(e)
          onError?.(e)
        }
        return undefined
      } finally {
        if (mountedRef.current) setPending(false)
      }
    },
    [url, method, headers, onSuccess, onError],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { submit, data, error, pending, reset }
}
