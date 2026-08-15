/**
 * vdom3 root — 应用入口：createRoot（挂载 + 组件渲染上下文）
 *
 * 组件 ctx.render()：调度自身重渲染（同 tick 合并——一次 patch）。
 * 渲染流程：renderFn 重跑 → buildVNode（oldV 对照复用）→ patch（事件流 → DOM）。
 */

import type { VNode } from './types.ts'
import { buildVNode } from './build.ts'
import { patch, mount } from './render.ts'
import { scheduler } from './scheduler.ts'

export interface V3Ctx {
  render: () => void
  /** 组件自身输出（渲染定位） */
  _vnode: VNode
  _parent: Node | null
}

export interface RootHandle {
  ctx: V3Ctx
  /** 组件重渲染（ctx.render 内部路径——同 tick 合并） */
  rerender(): void
  /** 立即刷新（测试） */
  flush(): void
  unmount(): void
}

/** 创建应用根（挂载组件树——组件获得 ctx.render 调度能力） */
export function createRoot(vnode: VNode, root: HTMLElement): RootHandle {
  let current = vnode

  async function update(): Promise<void> {
    // 重跑 renderFn → 构建（oldV 对照复用 _render）→ patch（事件流 → DOM）
    if (typeof current.type === 'function' && current._render) {
      const output = await current._render(current.props)
      if (output == null) return
      const oldOut = current.children?.[0] ?? null
      const built = await buildVNode(output, {}, oldOut && typeof oldOut === 'object' ? (oldOut as VNode) : null)
      current.children = [built]
      patch(oldOut as VNode | null, built, root)
    }
  }

  const ctx: V3Ctx = {
    _vnode: vnode,
    _parent: root,
    render() {
      scheduler.schedule(() => void update())
    },
  }

  const handle: RootHandle = {
    ctx,
    rerender: () => scheduler.schedule(() => void update()),
    flush: () => scheduler.flush(),
    unmount() {
      // COMP_UNMOUNT（根组件）
      if (current._id) {
        const { stream } = require('./events.ts') as typeof import('./events.ts')
        stream.emit({ type: 'COMP_UNMOUNT', id: current._id, name: 'root', ts: Date.now() })
      }
      root.innerHTML = ''
    },
  }

  // 初始挂载（组件构建——ctx 注入）
  void (async () => {
    await buildVNode(vnode, ctx as unknown as Record<string, unknown>)
    mount(vnode, root)
    current = vnode
  })()

  return handle
}
