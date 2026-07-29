/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()        同步刷新当前组件
 *   ctx.ui.render(['#id']) 同步刷新指定组件
 *   ctx.ui.dirty()         异步刷新当前组件（微任务批处理）
 *   ctx.ui.$()             响应式状态容器（$.x = val 自动 dirty）
 *
 * render / dirty / $ 通过 prototype chain 实现组件级 scope：
 *   每个组件 mount 时创建 childCtx.ui = Object.create(ctx.ui)
 *   并设置 childCtx.ui._selfId = 组件 ID
 *   render() 无参时从 this._selfId 取当前组件 ID
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { render, patchValue, idRegistry } from './render.ts'
import type { VNode, Component } from './vnode.ts'

// 用于 RouteView 布局深度追踪
import { layoutDepth } from './router.ts'

// ── createApp ──────────────────────────────────────────

export function createApp() {
  const middlewares: AppMiddleware[] = []
  let ctx: WfuiContext = {} as WfuiContext
  let container: Element | null = null
  let rootComponent: Component | null = null
  let oldVNode: VNode | null = null
  let _rendering = false

  // ── 异步渲染批处理 ──────────────────────────────────
  let _dirtyBatch = new Set<string>()
  let _dirtyScheduled = false

  // ── 核心：按 ID 列表渲染组件 ───────────────────────
  function renderByIds(ids: string[]) {
    if (_rendering) return
    _rendering = true
    layoutDepth.delete(ctx)

    for (const id of ids) {
      const vnode = idRegistry.get(id)
      if (!vnode || !vnode._render) continue
      const oldChild = vnode._child
      const newChild = vnode._render(vnode.props)
      vnode._child = newChild
      if (vnode._parentNode) {
        const newNode = patchValue(
          vnode._parentNode,
          vnode._refNode ?? null,
          oldChild, newChild, ctx,
        )
        // patch 后更新 _refNode（可能被替换）
        if (newNode && newNode !== vnode._refNode) {
          vnode._refNode = newNode
        }
      }
    }

    _rendering = false

    // 渲染过程中可能积累了 dirty 标记
    flushDirtyBatch()
  }

  function flushDirtyBatch() {
    if (_dirtyBatch.size > 0 && !_dirtyScheduled) {
      _dirtyScheduled = true
      queueMicrotask(() => {
        _dirtyScheduled = false
        const batch = [..._dirtyBatch]
        _dirtyBatch.clear()
        if (batch.length > 0) renderByIds(batch)
      })
    }
  }

  /** 获取调用者（组件）的 selfId — 优先从 this，其次从 app 层 ctx */
  function getSelfId(uiObj: any): string | undefined {
    return uiObj?._selfId ?? (ctx as any).ui?._selfId
  }

  const app = {
    get ctx() { return ctx },

    use(mw: AppMiddleware) {
      middlewares.push(mw)
      return app
    },

    async mount(rootSelector: string, RootComponent: Component) {
      rootComponent = RootComponent

      for (const mw of middlewares) {
        ctx = await mw(ctx)
      }

      const el = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector
      if (!el) throw new Error(`mount target not found: ${rootSelector}`)
      container = el as Element
      container.innerHTML = ''

      // ── 注入 ctx.ui ──────────────────────────────────
      ;(ctx as any).ui = {
        _selfId: '_wf_root',

        /** 同步刷新（无参 = 当前组件，传参 = 指定组件列表） */
        render: function (ids?: string[]) {
          if (!ids || ids.length === 0) {
            const selfId = getSelfId(this)
            if (selfId) ids = [selfId]
            else return
          }
          renderByIds(ids)
        },

        /** 异步刷新（微任务批处理，无参 = 当前组件） */
        dirty: function (ids?: string[]) {
          if (_rendering) return
          if (!ids || ids.length === 0) {
            const selfId = getSelfId(this)
            if (selfId) ids = [selfId]
            else return
          }
          for (const id of ids) {
            if (id) _dirtyBatch.add(id)
          }
          if (!_dirtyScheduled) {
            _dirtyScheduled = true
            queueMicrotask(() => {
              _dirtyScheduled = false
              const batch = [..._dirtyBatch]
              _dirtyBatch.clear()
              if (batch.length > 0) renderByIds(batch)
            })
          }
        },

        /** 创建响应式状态容器：$.x = val 自动触发 dirty() */
        $: function () {
          const selfId = getSelfId(this)
          return createReactiveState(() => {
            if (selfId) (ctx as any).ui.dirty([selfId])
          })
        },
      }

      // ── 首次渲染 ──────────────────────────────────────
      _rendering = true
      oldVNode = wrapComponent(RootComponent, ctx)
      oldVNode._id = '_wf_root'
      oldVNode._parentNode = container
      oldVNode._refNode = null
      idRegistry.set('_wf_root', oldVNode)

      const node = render(oldVNode, ctx)
      if (node instanceof Node) container.appendChild(node)

      // 更新根节点 _refNode 为首个 DOM 节点
      oldVNode._refNode = container.firstChild

      _rendering = false

      // 消化 mount 过程中积累的 dirty 标记
      flushDirtyBatch()
    },

    destroy() {
      if (container) container.innerHTML = ''
      container = null
      ctx = {} as WfuiContext
    },
  }

  return app
}

function wrapComponent(Comp: Component, _ctx: WfuiContext): VNode {
  return { type: Comp, props: {}, key: undefined }
}

/** 创建响应式状态容器：深度 Proxy，任意层级属性赋值自动触发 render */
function createReactiveState(dirty: () => void): Record<string, any> {
  const proxyCache = new WeakMap()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target

    // 相同底层对象返回同一 Proxy 实例，保证引用稳定、减少 GC
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(target, key, value) {
        const old = Reflect.get(target, key)
        if (old === value) return true
        Reflect.set(target, key, value)
        dirty()
        return true
      },
      get(target, key) {
        const value = Reflect.get(target, key)
        // 返回深度包装的 Proxy，确保深层赋值也能触发 dirty
        if (typeof value === 'object' && value !== null) return reactive(value)
        return value
      },
      deleteProperty(target, key) {
        if (Reflect.has(target, key)) {
          Reflect.deleteProperty(target, key)
          dirty()
        }
        return true
      },
    })

    proxyCache.set(target, proxy)
    return proxy
  }

  return reactive({})
}
