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

/**
 * 弹层视口夹紧——fixed 定位弹层超高/超宽时，超出视口部分不可交互。
 *
 * 实测场景：DatePicker datetime/range 面板高约 416px，锚点在页面中部时
 * bottom 超出视口 → 底部“确定/取消”按钮落在窗口外，真实点击不可达。
 *
 * 以面板真实渲染矩形（含 transform 居中偏移）为基准平移坐标，
 * 保证：top/left 不动时面板整体回到视口内（保留 margin 安全边距）。
 *
 * @param pos 计算出的坐标（top/left，可选 width）
 * @param panel 已渲染的面板元素；null/undefined 时不夹紧（调用方未提供）
 * @param margin 视口边缘安全边距（px），默认 8
 */
export function clampToViewport(
  pos: { top: number; left: number; width?: number },
  panel: HTMLElement | null | undefined,
  margin = 8,
): { top: number; left: number; width?: number } {
  if (!panel) return pos
  const r = panel.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return pos // 未布局（jsdom/隐藏）：跳过
  // 面板当前渲染位置（style.top/left，可能还是旧坐标——首开时是初始 0）
  const curTop = Number.parseFloat(panel.style.top as string) || r.top
  const curLeft = Number.parseFloat(panel.style.left as string) || r.left
  // 目标位置下的面板矩形 = 当前矩形 + 目标位移（translate 变换恒定，位移同步叠加）
  const dy = pos.top - curTop
  const dx = pos.left - curLeft
  const target = {
    top: r.top + dy,
    bottom: r.bottom + dy,
    left: r.left + dx,
    right: r.right + dx,
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = pos.top
  let left = pos.left
  // 垂直：底部/顶部超出 → 平移回视口（下限 margin，不反向越界）
  if (target.bottom > vh - margin) top = Math.max(margin, top - (target.bottom - (vh - margin)))
  if (target.top < margin) top = Math.max(margin, top + (margin - target.top))
  // 水平：右侧/左侧超出 → 平移回视口
  if (target.right > vw - margin) left = Math.max(margin, left - (target.right - (vw - margin)))
  if (target.left < margin) left = Math.max(margin, left + (margin - target.left))
  return { top, left, width: pos.width }
}
