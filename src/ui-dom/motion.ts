/**
 * weifuwu/ui-dom — 动效工具
 *
 * animateOut：挂 --exit 类播退场动画，animationend 后回调。
 * - reduced-motion 下动画时长被 _base.css 降为 0.01ms，animationend 立即触发，等效瞬时关闭
 * - 兜底 timeout：类未命中动画（防御）或 animationend 丢失时不挂死
 */

import { bindElementListener } from './vdom3/delegate.ts'

export function animateOut(
  el: HTMLElement,
  onDone: () => void,
  fallbackMs = 400,
): void {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    off()
    clearTimeout(timer)
    onDone()
  }
  // 动画监听统一走事件代理（once——EVENT_UNBIND 可观测；el 有 data-v3-id
  // 时注册——无 id（SSR/工具场景）保持直接监听兜底）
  let off: () => void = () => {}
  const elId = el.getAttribute?.('data-v3-id')
  if (elId) off = bindElementListener(el, 'animationend', finish as EventListener, true)
  else el.addEventListener('animationend', finish)
  const timer = setTimeout(finish, fallbackMs)
}
