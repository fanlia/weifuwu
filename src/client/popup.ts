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
  const rect = el.getBoundingClientRect()

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
