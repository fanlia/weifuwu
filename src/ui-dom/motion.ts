/**
 * weifuwu/ui-dom — 动效工具
 *
 * animateOut：挂 --exit 类播退场动画，animationend 后回调。
 * - reduced-motion 下动画时长被 _base.css 降为 0.01ms，animationend 立即触发，等效瞬时关闭
 * - 兜底 timeout：类未命中动画（防御）或 animationend 丢失时不挂死
 */

export function animateOut(
  el: HTMLElement,
  onDone: () => void,
  fallbackMs = 400,
): void {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    el.removeEventListener('animationend', finish)
    clearTimeout(timer)
    onDone()
  }
  el.addEventListener('animationend', finish)
  const timer = setTimeout(finish, fallbackMs)
}
