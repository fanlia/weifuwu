/**
 * weifuwu/client — ScrollLock
 *
 * 锁定/解锁 body 滚动。支持多层嵌套（多个弹窗同时打开）。
 *
 * 使用：
 *   import { lockScroll, unlockScroll } from 'weifuwu/client'
 *
 *   lockScroll()   // Modal/Drawer 打开时
 *   unlockScroll() // Modal/Drawer 关闭时
 */

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

  scrollY = window.scrollY
  const body = document.body

  originalOverflow = body.style.overflow
  originalPosition = body.style.position
  originalTop = body.style.top
  originalWidth = body.style.width

  body.style.overflow = 'hidden'

  // iOS Safari: position: fixed + top 防止 overscroll
  const isIOS = /iPhone|iPad|iPod/.test(navigator.platform) ||
    (/Mac/.test(navigator.platform) && 'ontouchend' in document)
  if (isIOS) {
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
  }
}

export function unlockScroll(): void {
  lockedCount--
  if (lockedCount > 0) return
  if (!canLock()) return

  const body = document.body
  body.style.overflow = originalOverflow
  body.style.position = originalPosition
  body.style.top = originalTop
  body.style.width = originalWidth

  if (scrollY > 0) {
    window.scrollTo(0, scrollY)
  }
}
