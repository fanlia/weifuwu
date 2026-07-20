/**
 * Floating element positioning — places a target element relative to an anchor.
 * Returns cleanup function. Handles scroll/resize recalculation.
 *
 * Features:
 * - 12 placement positions (top/bottom/left/right + start/center/end)
 * - Auto-flip to keep in viewport
 * - Gap/spacing between anchor and floating
 */

export type Placement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'

export interface FloatingOptions {
  placement?: Placement
  gap?: number
  autoFlip?: boolean
}

interface Rect { top: number; bottom: number; left: number; right: number; width: number; height: number }

function getRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
}

const opposite: Record<string, string> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
const mainAxes: Record<string, 'vertical' | 'horizontal'> = { top: 'vertical', bottom: 'vertical', left: 'horizontal', right: 'horizontal' }

function calcPosition(anchor: HTMLElement, floating: HTMLElement, opts: Required<FloatingOptions>) {
  const a = getRect(anchor)
  const f = getRect(floating)
  const { gap, placement } = opts
  const [side, align = 'center'] = placement.split('-') as [string, string]
  const axis = mainAxes[side]

  let x = 0, y = 0

  // Position on main axis
  if (side === 'top') y = a.top - f.height - gap
  else if (side === 'bottom') y = a.bottom + gap
  else if (side === 'left') x = a.left - f.width - gap
  else if (side === 'right') x = a.right + gap

  // Position on cross axis
  if (axis === 'vertical') {
    if (align === 'start') x = a.left
    else if (align === 'end') x = a.right - f.width
    else x = a.left + (a.width - f.width) / 2
  } else { // horizontal
    if (align === 'start') y = a.top
    else if (align === 'end') y = a.bottom - f.height
    else y = a.top + (a.height - f.height) / 2
  }

  return { x, y, side, align }
}

function flipIfOutOfViewport(pos: { x: number, y: number, side: string, align: string }, floating: HTMLElement, opts: Required<FloatingOptions>): { x: number, y: number, side: string } {
  const f = getRect(floating)
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = opts.gap
  let { x, y, side, align } = { ...pos }

  // If out of viewport, flip to opposite side
  let flipped = false
  if (side === 'top' && y < 0) { side = 'bottom'; flipped = true }
  else if (side === 'bottom' && y + f.height > vh) { side = 'top'; flipped = true }
  else if (side === 'left' && x < 0) { side = 'right'; flipped = true }
  else if (side === 'right' && x + f.width > vw) { side = 'left'; flipped = true }

  if (flipped) {
    // Recalculate with flipped side
    const anchor = floating.parentElement?.querySelector('[data-floating-anchor]') as HTMLElement
    if (anchor) {
      const a = getRect(anchor)
      if (side === 'top') y = a.top - f.height - gap
      else if (side === 'bottom') y = a.bottom + gap
      else if (side === 'left') x = a.left - f.width - gap
      else if (side === 'right') x = a.right + gap
    }
  }

  return { x, y, side }
}

export function createFloating(
  anchor: HTMLElement,
  floating: HTMLElement,
  options?: FloatingOptions
): () => void {
  const opts: Required<FloatingOptions> = {
    placement: options?.placement ?? 'bottom',
    gap: options?.gap ?? 6,
    autoFlip: options?.autoFlip ?? true,
  }

  floating.dataset.floatingAnchor = ''

  function position() {
    const pos = calcPosition(anchor, floating, opts)
    const finalPos = opts.autoFlip ? flipIfOutOfViewport(pos, floating, opts) : pos
    floating.style.position = 'fixed'
    floating.style.left = `${Math.round(finalPos.x)}px`
    floating.style.top = `${Math.round(finalPos.y)}px`
  }

  position()
  window.addEventListener('scroll', position, true)
  window.addEventListener('resize', position)

  return () => {
    window.removeEventListener('scroll', position, true)
    window.removeEventListener('resize', position)
    delete floating.dataset.floatingAnchor
  }
}
