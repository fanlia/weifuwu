/**
 * ui-dom/middleware/serve — uiServe（UIRouter + vdom3 引擎）前端中间件
 *
 * vdom2 删除后重建：渲染管线（vdom3）——router._handle（匹配 + 执行 handler
 * 链 → VNode）→ buildVNode（异步组件展开）→ mount/patch（同步落地）。
 * UIRouter 纯路由保留（router.ts——不依赖 vdom2 引擎）——应用经入口引用
 * （weifuwu/ui-dom）——vdom2 API 平滑（迁移顺利）。
 */

import type { UIRouter } from '../router.ts'
import { buildVNode } from '../vdom3/build.ts'
import { mount, patch } from '../vdom3/render.ts'
import type { V3Ctx, VNode as V3Node } from '../vdom3/types.ts'
import type { VNode } from '../vnode.ts'

/** uiServe 选项 */
export interface UIServeOptions {
  root: string | Element
  /** loading 模式：不清空 root（信任调用方预置骨架屏 HTML）——首帧原子替换 */
  loading?: boolean
}

/** serve 句柄 */
export interface UIServeHandle<C extends object = {}> {
  /** 释放全部资源（监听/渲染状态） */
  close(): void
  /** 立即处理当前 URL（测试/恢复） */
  refresh(): Promise<void>
}

/**
 * uiServe — UIRouter 路由 → vdom3 渲染（页面级——组件 ctx.render 调度当前页更新）
 */
export function uiServe<C extends object = {}>(router: UIRouter<C>, opts: UIServeOptions): UIServeHandle<C> {
  const root = (typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root) as HTMLElement
  let current: VNode | null = null
  let busy = false
  let queue = false

  /** 页面渲染（当前 URL——UIRouter 匹配 → vdom3 渲染） */
  async function handle(): Promise<void> {
    if (busy) { queue = true; return }
    busy = true
    try {
      // 页面级 ctx（组件 ctx.render 调度——UIRouter 中间件注入链执行于此）
      const pageCtx = {
        render: () => { void handle() },
      }
      const vnode = await router._handle(window.location.pathname, window.location, pageCtx as never)
      if (vnode == null) {
        root.innerHTML = ''
        current = null
        return
      }
      // vdom2 VNode → vdom3 VNode（结构兼容——childrenOf 等已统一——边界断言）
      const built = await buildVNode(vnode as unknown as V3Node, pageCtx as unknown as V3Ctx, current as V3Node | null)
      if (current) patch(current as V3Node, built, root)
      else mount(built, root, undefined)
      current = built as unknown as VNode
    } finally {
      busy = false
      if (queue) { queue = false; void handle() }
    }
  }

  const onPop = () => { void handle() }
  window.addEventListener('popstate', onPop)

  void handle()

  return {
    close: () => { window.removeEventListener('popstate', onPop) },
    refresh: () => handle(),
  }
}
