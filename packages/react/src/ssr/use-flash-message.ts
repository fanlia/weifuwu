/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'

/**
 * React hook to read the server-flashed message on the client side.
 */
export function useFlashMessage<T = any>(): T | null {
  const [flash] = useState<T | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = (window as any).__WEIFUWU_CTX?.flash?.value
    if (raw === undefined || raw === null) return null
    return raw as T
  })
  return flash
}
