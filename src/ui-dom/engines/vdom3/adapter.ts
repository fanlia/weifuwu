/**
 * engines/vdom3 — 渲染引擎适配器（RendererService 实现——引擎与 ui-dom 的唯一耦合点）
 *
 * vdom4 端口化 UI-2：vdom3 引擎适配——createRoot/createRouter 转发 +
 * mountCommand（命令式中间件容器）+ renderToString（事件流 → HTML 组装）。
 * v5 换引擎 = 新增 engines/vdom5/adapter.ts 实现同一接口——ui-dom 其余零改动。
 */

import type { RendererService, RootHandle, RouterHandle, RouteDef } from '../../contracts/renderer.ts'
import type { VNode } from '../../contracts/vnode.ts'
import { createRoot as v3CreateRoot } from '../../vdom3/root.ts'
import { createRouter as v3CreateRouter } from '../../vdom3/router.ts'
import { renderToEvents, eventsToHtml } from '../../vdom3/ssr.ts'
import { setRenderer, hasRenderer } from '../../services/render-service.ts'

/** vdom3 引擎适配器（行为与直接调用 vdom3 完全一致——转发零包装） */
export const vdom3Renderer: RendererService = {
  createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): RootHandle {
    return v3CreateRoot(vnode, root, options)
  },

  createRouter(routes: RouteDef[], root: HTMLElement, options?: { initialPath?: string; ctx?: Record<string, unknown>; history?: boolean }): RouterHandle {
    return v3CreateRouter(routes, root, options)
  },

  mountCommand(vnode: VNode, container: HTMLElement, options?: { ctx?: Record<string, unknown> }): { unmount(): void; rerender(): void } {
    const handle = v3CreateRoot(vnode, container, options)
    return { unmount: () => handle.unmount(), rerender: () => handle.rerender() }
  },

  async renderToString(vnode: VNode): Promise<string> {
    return eventsToHtml(await renderToEvents(vnode))
  },
}

// 引擎自注册（兜底——子路径/测试直接 import 引擎时无需先走 ui-dom 门面——
// index.ts 门面显式注册为主路径——重复注册无害（覆盖））
if (!hasRenderer()) setRenderer(vdom3Renderer)
