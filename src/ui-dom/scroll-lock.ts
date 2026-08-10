/**
 * weifuwu/client — ScrollLock
 */

import { createClientBrowser } from './browser.ts'
const browser = createClientBrowser()

let lockedCount = 0
let originalOverflow = ''
let originalPosition = ''
let originalTop = ''
let originalWidth = ''
let scrollY = 0

function canLock(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function lockScroll(): void {
  lockedCount++
  if (lockedCount > 1) return
  if (!canLock()) return

  scrollY = browser.scrollTop()
  const body = browser.bodyElement() as HTMLElement
  originalOverflow = body.style.overflow
  originalPosition = body.style.position
  originalTop = body.style.top
  originalWidth = body.style.width

  body.style.overflow = 'hidden'

  const isIOS = /iPhone|iPad|iPod/.test(navigator.platform) ||
    (/Mac/.test(navigator.platform) && 'ontouchend' in document)
  if (isIOS) {
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
  }
}

export function unlockScroll(): void {
  // 下溢防护：未锁定时 unlock 是 no-op（防 lockedCount 走负数后
  // 错误还原 style / scrollTo 覆盖其他锁定者）
  if (lockedCount === 0) return
  lockedCount--
  if (lockedCount > 0) return
  if (!canLock()) return

  const body = browser.bodyElement() as HTMLElement
  body.style.overflow = originalOverflow
  body.style.position = originalPosition
  body.style.top = originalTop
  body.style.width = originalWidth

  if (scrollY > 0) browser.scrollTo(scrollY)
}
