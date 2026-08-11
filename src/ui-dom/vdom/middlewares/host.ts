/**
 * vdom/middlewares/host — 命令式挂载共享辅助
 *
 * 命令式中间件（toast/confirm/notification）动态挂载组件到独立 body 容器：
 *   buildVNode（async await 工厂）→ renderValue（DOM 落地）→ 设 _parentNode
 *   （$ dirty → vdom scheduler → renderByIds 定位容器——精准刷新）。
 *
 * 与第 1 代 mountVNode 的区别：vdom 无占位/无同步工厂——buildVNode await 完成
 * 后才落地 DOM；$ 状态走 ctx.ui.dirty（无自动渲染——只有 $ 赋值触发）。
 */

import { createClientBrowser } from '../../browser.ts'
import type { BrowserEnv, WfuiContext } from '../../types.ts'
import type { VNode } from '../../vnode.ts'
import { buildVNode } from '../build.ts'
import { renderValue } from '../render.ts'
import { cleanupComponent, type Registry } from '../registry.ts'
import { callRefCleanupFor } from '../../registry.ts'

/** vdom 命令式挂载：buildVNode（await 工厂）→ renderValue → append + _parentNode */
export function mountCommand(
  container: HTMLElement,
  vnode: VNode,
  ctx: WfuiContext,
  opts?: { onMounted?: () => void },
): { id: string } {
  const reg = (ctx as any).__registry as Registry | undefined
  const browser = (ctx.browser ?? createClientBrowser()) as BrowserEnv
  void buildVNode(vnode, ctx, undefined, reg)
    .then(() => {
      const node = renderValue(vnode, ctx, browser)
      if (node != null) container.appendChild(node)
      // 关键：$ dirty → renderByIds 定位容器（否则 vnode._parentNode 为 null——跳过）
      if (vnode._id && reg) {
        const v = reg.idRegistry.get(vnode._id)
        if (v) v._parentNode = container
      }
      opts?.onMounted?.()
    })
    .catch((e) => console.error('[weifuwu] command mount error', e))
  return { id: vnode._id ?? '' }
}

/** vdom 命令式卸载：ref 清理 + 卸载钩子 + 容器移除 */
export function unmountCommand(container: HTMLElement, vnode: VNode | null, ctx: WfuiContext): void {
  const reg = (ctx as any).__registry as Registry | undefined
  if (vnode && reg) {
    callRefCleanupFor(vnode, reg as any)
    if (vnode._id) cleanupComponent(reg, vnode._id)
  }
  container.remove()
}

/** 创建命令式挂载容器（body 下独立 div） */
export function createCommandContainer(): HTMLDivElement | null {
  const browser = createClientBrowser()
  const container = browser.createElement('div')
  if (!container) return null
  browser.bodyAppend(container)
  return container
}
