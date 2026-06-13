import { useState } from 'react'

export function useFlashMessage<T = any>(): T | null {
  const [flash] = useState<T | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = (window as any).__WEIFUWU_CTX?.flash?.value
    if (raw === undefined || raw === null) return null
    return raw as T
  })
  return flash
}
