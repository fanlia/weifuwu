/**
 * Link — 客户端路由导航组件
 *
 * 替代原生 <a> 标签，拦截默认导航行为走 SPA 路由。
 * 支持右键「在新标签页打开」、中键、键盘导航。
 *
 * ```tsx
 * import { Link } from 'weifuwu/client'
 *
 * function Nav() {
 *   return (
 *     <nav>
 *       <Link to="/">首页</Link>
 *       <Link to="/about">关于</Link>
 *       <Link to="/user/wefu">用户</Link>
 *     </nav>
 *   )
 * }
 * ```
 */

import type { Component } from '../jsx-runtime.ts'
import type { WfuiContext } from '../types.ts'

function isModifiedEvent(e: MouseEvent): boolean {
  return e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.button === 1
}

export const Link: Component<{ to: string; class?: string; children?: Node | string | (Node | string)[] }> = (props, ctx: WfuiContext) => {
  const { to, class: cls, children } = props

  const anchor = document.createElement('a')
  anchor.href = to
  if (cls) anchor.className = cls

  // 拦截点击 — 非修饰键点击走 SPA 导航
  anchor.addEventListener('click', (e: MouseEvent) => {
    if (isModifiedEvent(e)) return // 让浏览器处理（新标签页等）
    e.preventDefault()
    ctx.app.navigate(to)
  })

  // 渲染子节点
  if (children != null) {
    if (typeof children === 'string') {
      anchor.textContent = children
    } else if (children instanceof Node) {
      anchor.appendChild(children)
    } else if (Array.isArray(children)) {
      for (const child of children) {
        if (child instanceof Node) anchor.appendChild(child)
        else if (typeof child === 'string') anchor.appendChild(document.createTextNode(child))
      }
    }
  }

  return anchor
}

export default Link
