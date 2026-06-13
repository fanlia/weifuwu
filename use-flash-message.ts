import { useState } from 'react'

/**
 * React hook to read the server-flashed message on the client side.
 *
 * Reads `window.__WEIFUWU_CTX.flash.value` (set by the flash middleware
 * during SSR). Returns `null` when no flash message is present.
 *
 * ```tsx
 * import { useFlashMessage } from 'weifuwu/react'
 *
 * function FlashNotice() {
 *   const flash = useFlashMessage<{ type: string; text: string }>()
 *   if (!flash) return null
 *   return <div className={flash.type}>{flash.text}</div>
 * }
 * ```
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
