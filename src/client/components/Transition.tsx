/**
 * Transition — 动画过渡组件
 *
 * 为元素的进入/离开添加 CSS 过渡动画。
 * 配合 CSS 类名使用：{name}-enter / {name}-enter-active / {name}-leave / {name}-leave-active
 *
 * ```css
 * .fade-enter { opacity: 0; }
 * .fade-enter-active { opacity: 1; transition: opacity 0.3s; }
 * .fade-leave { opacity: 1; }
 * .fade-leave-active { opacity: 0; transition: opacity 0.2s; }
 * ```
 *
 * ```tsx
 * import { Transition, signal } from 'weifuwu/client'
 *
 * function Modal({ show, children }) {
 *   return (
 *     <Transition show={show} name="fade">
 *       <div class="modal">{children}</div>
 *     </Transition>
 *   )
 * }
 * ```
 */

import { isSignal, effect } from '../signal.ts'
import type { Signal } from '../signal.ts'
import { jsx } from '../jsx-runtime.ts'

export interface TransitionProps {
  show: boolean | Signal<boolean>
  /** CSS class 前缀，默认 "wefu-t" */
  name?: string
  /** 动画超时回退（毫秒），默认 300 */
  duration?: number
  children: any
}

/**
 * Transition — 带动画的进入/离开组件。
 *
 * 使用 CSS transition/animation 控制元素出现和消失。
 * 通过 `name` 属性指定 CSS class 前缀。
 */
export function Transition({ show, name = 'wefu-t', duration = 300, children }: TransitionProps): Node {
  const container = document.createElement('div')
  container.style.display = 'contents'

  let childEl: Node | null = null
  let leaveTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
  }

  function enter() {
    clearTimer()

    // 创建子节点
    const newChild = (typeof children === 'function' ? children() : children) ?? document.createDocumentFragment()
    childEl = newChild
    container.appendChild(newChild)

    // 确保子节点是 Element 才能加 class
    const target = newChild instanceof Element ? newChild : container.firstElementChild
    if (!target) return

    // 1. 添加 enter class（初始态）
    target.classList.add(`${name}-enter`)

    // 2. 下一帧添加 enter-active（过渡态）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.classList.add(`${name}-enter-active`)

        // 3. 动画结束后清理
        const onEnd = () => {
          target.classList.remove(`${name}-enter`, `${name}-enter-active`)
          target.removeEventListener('transitionend', onEnd)
          target.removeEventListener('animationend', onEnd)
        }
        target.addEventListener('transitionend', onEnd)
        target.addEventListener('animationend', onEnd)
        // 超时回退
        setTimeout(onEnd, duration)
      })
    })
  }

  function leave() {
    clearTimer()
    const target = childEl instanceof Element ? childEl : container.firstElementChild
    if (!target) {
      // 没有可动画的元素，直接清空
      if (childEl && container.contains(childEl as Node)) container.removeChild(childEl as Node)
      childEl = null
      return
    }

    // 1. 添加 leave class（初始态）
    target.classList.add(`${name}-leave`)

    // 2. 下一帧添加 leave-active（过渡态）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.classList.add(`${name}-leave-active`)

        // 3. 动画结束后移除子节点
        const onEnd = () => {
          target.classList.remove(`${name}-leave`, `${name}-leave-active`)
          target.removeEventListener('transitionend', onEnd)
          target.removeEventListener('animationend', onEnd)
          if (childEl && container.contains(childEl)) container.removeChild(childEl)
          childEl = null
        }
        target.addEventListener('transitionend', onEnd)
        target.addEventListener('animationend', onEnd)
        // 超时回退
        leaveTimer = setTimeout(onEnd, duration)
      })
    })
  }

  // 响应 show 变化
  if (isSignal(show)) {
    effect(() => {
      if (show.value) {
        enter()
      } else {
        leave()
      }
    })
  } else {
    if (show) enter()
  }

  return container
}

export default Transition
