import { useState } from 'react'

export function useFlashMessage<T = any>(): T | null {
  const [flash] = useState<T | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = (window as any).__WEIFUWU_CTX?.parsed?.flash
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  })
  return flash
}
