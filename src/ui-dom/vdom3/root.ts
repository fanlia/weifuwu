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
  /** 首帧完成 Promise（初始挂载——工厂 await + 渲染落地） */
  ready: Promise<void>
}

/** 创建应用根（挂载组件树——组件获得 ctx.render 调度能力；options.ctx 注入扩展字段
 *  ——中间件面（app/i18n/auth/data 等——组件 ctx 可选链消费）） */
export function createRoot(vnode: VNode, root: HTMLElement, options?: { ctx?: Record<string, unknown> }): RootHandle {
  let current = vnode

  // 渲染串行 + dirty 合并（async update 并发 → 同基于初始树 patch → 结构错乱；
  // 渲染中再次触发 → 标记 dirty → 完成后补跑一次读最新状态——防死循环）
  let updating = false
  let dirty = false
  async function update(): Promise<void> {
    if (updating) { dirty = true; return }
    updating = true
    try {
      do {
        dirty = false
        // 统一重建：buildVNode（组件根 → renderFn 重跑复用实例；native 根 → 全树递归；
        // oldV 对照复用 _render）→ patch（事件流 → DOM）
        const built = await buildVNode(vnode, ctx as unknown as Record<string, unknown>, current)
        if (current == null) {
          mount(built, root)
        } else {
          patch(current, built, root)
        }
        current = built
      } while (dirty)
    } finally {
      updating = false
    }
  }

  const ctx: V3Ctx = {
    _vnode: vnode,
    _parent: root,
    ...(options?.ctx ?? {}),
    render() {
      scheduler.schedule(() => void update())
    },
  } as V3Ctx

  // ready = 首帧完成 Promise
  let readyResolve!: () => void
  const ready = new Promise<void>((res) => { readyResolve = res })

  const handle: RootHandle = {
    ctx,
    ready,
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
    try {
      const built = await buildVNode(vnode, ctx as unknown as Record<string, unknown>)
      mount(built, root)
      current = built
    } finally {
      readyResolve()
    }
  })()

  return handle
}
