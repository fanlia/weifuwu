/**
 * weifuwu/client — 弹出层定位工具
 *
 * 基于 position: fixed 的坐标计算，替代 CSS absolute 定位。
 * 配合 createPortal 使用，让弹出层不受父级 overflow/transform 影响。
 */

export interface FixedPos {
  top: number
  left: number
}

export type Placement = 'top' | 'bottom' | 'left' | 'right'

/**
 * 根据触发元素 rect 和方向计算弹出层的 fixed 坐标（视口坐标）
 *
 * 与 computeFixedPos 等价，但直接接收 rect，方便在 scroll/resize
 * 监听中复用（配合 ctx.ui.usePopupPosition）。
 *
 * @param rect 触发元素的 getBoundingClientRect()
 * @param placement 弹出方向
 * @param gap 间距（px），默认 6
 * @param center 是否居中于触发元素，默认 true
 */
export function computeFixedPosRect(
  rect: DOMRect,
  placement: Placement = 'bottom',
  gap = 6,
  center = true,
): FixedPos {
  switch (placement) {
    case 'bottom':
      return {
        top: rect.bottom + gap,
        left: center ? rect.left + rect.width / 2 : rect.left,
      }
    case 'top':
      return {
        top: rect.top - gap,
        left: center ? rect.left + rect.width / 2 : rect.left,
      }
    case 'left':
      return {
        top: center ? rect.top + rect.height / 2 : rect.top,
        left: rect.left - gap,
      }
    case 'right':
      return {
        top: center ? rect.top + rect.height / 2 : rect.top,
        left: rect.right + gap,
      }
  }
}

/**
 * 根据触发元素和方向计算弹出层的 fixed 坐标
 * @param el 触发元素
 * @param placement 弹出方向
 * @param gap 间距（px），默认 6
 * @param center 是否居中于触发元素，默认 true
 */
export function computeFixedPos(
  el: HTMLElement,
  placement: Placement = 'bottom',
  gap = 6,
  center = true,
): FixedPos {
  return computeFixedPosRect(el.getBoundingClientRect(), placement, gap, center)
}
