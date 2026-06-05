import { useState, useCallback, useRef } from 'react'

export interface UseActionOptions<T = any> {
  method?: string
  headers?: Record<string, string>
  onSuccess?: (data: T) => void
  onError?: (err: Error) => void
}

export interface UseActionReturn<T = any> {
  submit: (body?: any) => Promise<T | undefined>
  data: T | null
  error: Error | null
  pending: boolean
  reset: () => void
}

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

export function useAction<T = any>(
  url: string | URL,
  options?: UseActionOptions<T>,
): UseActionReturn<T> {
  const { method = 'POST', headers, onSuccess, onError } = options ?? {}
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [pending, setPending] = useState(false)
  const mountedRef = useRef(true)

  const submit = useCallback(async (body?: any): Promise<T | undefined> => {
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
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const result = res.status === 204 ? undefined as any : await res.json() as T

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
  }, [url, method, headers, onSuccess, onError])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { submit, data, error, pending, reset }
}
